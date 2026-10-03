package xhs

import (
	"bytes"
	"compress/flate"
	"crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"hash/crc32"
	"io"
	"math/bits"
	"strings"
	"time"
)

const alphabet36 = "0123456789abcdefghijklmnopqrstuvwxyz"

type RAPInput struct {
	API                    string
	Body, Fingerprint      []byte
	TimestampMS            int64
	Mask                   *byte
	XORKey, Nonce, Padding []byte
	MTime                  uint32
	BodyEncryptTime        *uint32
	Random                 io.Reader
}
type RAPResult struct {
	Value                             string
	Plaintext, EncR, Cipher, Envelope []byte
	GzipLength                        int
	CompressionFallback               bool
}

func XXHash32(data []byte, seed uint32) uint32 {
	const p1 uint32 = 0x9e3779b1
	const p2 uint32 = 0x85ebca77
	const p3 uint32 = 0xc2b2ae3d
	const p4 uint32 = 0x27d4eb2f
	const p5 uint32 = 0x165667b1
	var h uint32
	offset := 0
	n := len(data)
	if n >= 16 {
		v := []uint32{seed + p1 + p2, seed + p2, seed, seed - p1}
		for offset+16 <= n {
			for i := range v {
				word := binary.LittleEndian.Uint32(data[offset+i*4:])
				v[i] = bits.RotateLeft32(v[i]+word*p2, 13) * p1
			}
			offset += 16
		}
		h = bits.RotateLeft32(v[0], 1) + bits.RotateLeft32(v[1], 7) + bits.RotateLeft32(v[2], 12) + bits.RotateLeft32(v[3], 18)
	} else {
		h = seed + p5
	}
	h += uint32(n)
	for offset+4 <= n {
		h = bits.RotateLeft32(h+binary.LittleEndian.Uint32(data[offset:])*p3, 17) * p4
		offset += 4
	}
	for offset < n {
		h = bits.RotateLeft32(h+uint32(data[offset])*p5, 11) * p1
		offset++
	}
	h ^= h >> 15
	h *= p2
	h ^= h >> 13
	h *= p3
	h ^= h >> 16
	return h
}
func randomASCII(r io.Reader, n int) ([]byte, error) {
	data := make([]byte, n)
	if _, e := io.ReadFull(r, data); e != nil {
		return nil, e
	}
	for i, b := range data {
		data[i] = alphabet36[int(b)%36]
	}
	return data, nil
}
func defaultRAPFingerprint() []byte {
	value := resourceObject("rap_fingerprint_template.json")
	data, e := hex.DecodeString(jsText(value.Get("bodyUnmaskedHex")))
	if e != nil {
		panic(e)
	}
	return data
}

func BuildRAP(input RAPInput) (RAPResult, error) {
	r := input.Random
	if r == nil {
		r = rand.Reader
	}
	api := input.API
	if api == "" {
		api = "/api/sns/web/v1/homefeed"
	}
	url := api
	if !strings.HasPrefix(api, "https://") && !strings.HasPrefix(api, "http://") && !strings.HasPrefix(api, "//") {
		url = "//edith.xiaohongshu.com" + api
	}
	fp := input.Fingerprint
	if fp == nil {
		fp = defaultRAPFingerprint()
	}
	if len(fp) == 0 {
		return RAPResult{}, fmt.Errorf("RAP fingerprint required")
	}
	ts := input.TimestampMS
	if ts == 0 {
		ts = time.Now().UnixMilli()
	}
	var e error
	mask := byte(0)
	if input.Mask != nil {
		mask = *input.Mask
	} else {
		var value [1]byte
		if _, e = io.ReadFull(r, value[:]); e != nil {
			return RAPResult{}, e
		}
		mask = alphabet36[int(value[0])%36]
	}
	key := input.XORKey
	if key == nil {
		key, e = randomASCII(r, 16)
		if e != nil {
			return RAPResult{}, e
		}
	}
	if len(key) != 16 {
		return RAPResult{}, fmt.Errorf("RAP xor key must be 16 bytes")
	}
	nonce := input.Nonce
	if nonce == nil {
		var value [1]byte
		if _, e = io.ReadFull(r, value[:]); e != nil {
			return RAPResult{}, e
		}
		nonce, e = randomASCII(r, 4+int(value[0])/86)
		if e != nil {
			return RAPResult{}, e
		}
	}
	if len(nonce) < 4 || len(nonce) > 6 {
		return RAPResult{}, fmt.Errorf("RAP nonce must be 4, 5 or 6 bytes")
	}
	plain := make([]byte, len(fp)+16)
	plain[0], plain[1], plain[10], plain[11] = 3, 0xe8, 3, 0xe9
	binary.BigEndian.PutUint64(plain[2:], uint64(ts))
	binary.BigEndian.PutUint32(plain[12:], XXHash32([]byte{mask}, 0))
	body := append([]byte{}, fp...)
	for i := 0; i+5 < len(body); i++ {
		if body[i] == 3 && body[i+1] == 0xeb {
			binary.BigEndian.PutUint32(body[i+2:], XXHash32(append([]byte(url), input.Body...), 0))
			break
		}
	}
	for i, b := range body {
		plain[16+i] = b ^ mask
	}
	start := time.Now()
	gz, fallback, e := rapGzip(plain, input.MTime)
	if e != nil {
		return RAPResult{}, e
	}
	padding := input.Padding
	if padding == nil {
		padding, e = randomASCII(r, 16-len(gz)%16)
		if e != nil {
			return RAPResult{}, e
		}
	}
	padded := append(append([]byte{}, gz...), padding...)
	if len(padded)%16 != 0 {
		return RAPResult{}, fmt.Errorf("RAP padding does not align to a block")
	}
	for i := range padded {
		padded[i] ^= key[i%16]
	}
	cipher, e := rapECB(padded, false)
	if e != nil {
		return RAPResult{}, e
	}
	encR, e := rapECB(key, false)
	if e != nil {
		return RAPResult{}, e
	}
	elapsed := uint32(max(1, time.Since(start).Milliseconds()))
	if input.BodyEncryptTime != nil {
		elapsed = *input.BodyEncryptTime
	}
	n := len(nonce)
	envelope := make([]byte, 60+n+len(cipher))
	copy(envelope, []byte{7, 0x24, 1, byte(n)})
	binary.BigEndian.PutUint32(envelope[4:], 1)
	binary.BigEndian.PutUint32(envelope[8:], 20)
	binary.BigEndian.PutUint32(envelope[12:], uint32(len(cipher)+4))
	binary.BigEndian.PutUint32(envelope[20:], 0x283d)
	binary.BigEndian.PutUint32(envelope[24:], elapsed)
	copy(envelope[36:], nonce)
	copy(envelope[36+n:], encR)
	binary.BigEndian.PutUint32(envelope[52+n:], 16)
	copy(envelope[56+n:], cipher)
	binary.BigEndian.PutUint32(envelope[56+n+len(cipher):], uint32(len(gz)))
	binary.BigEndian.PutUint32(envelope[16:], XXHash32(envelope[36:], 0))
	return RAPResult{base64.StdEncoding.EncodeToString(envelope), plain, encR, cipher, envelope, len(gz), fallback}, nil
}
func rapGzip(data []byte, mtime uint32) ([]byte, bool, error) {
	if out, e := EncodeGzip(data, mtime); e == nil {
		return out, false, nil
	}
	// The reference falls back to zlib. Go's fallback is semantically equivalent,
	// but its deflate bytes are not claimed to match zlib.
	var b bytes.Buffer
	w, e := flate.NewWriter(&b, flate.BestCompression)
	if e != nil {
		return nil, true, e
	}
	if _, e = w.Write(data); e != nil {
		return nil, true, e
	}
	if e = w.Close(); e != nil {
		return nil, true, e
	}
	out := []byte{0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 3}
	binary.LittleEndian.PutUint32(out[4:], mtime)
	out = append(out, b.Bytes()...)
	out = binary.LittleEndian.AppendUint32(out, crc32.ChecksumIEEE(data))
	out = binary.LittleEndian.AppendUint32(out, uint32(len(data)))
	return out, true, nil
}
