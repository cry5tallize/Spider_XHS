package xhs

import (
	"encoding/binary"
	"fmt"
	"io"
	"math"
	"math/big"
	"math/bits"
	"net/url"
	"strconv"
	"strings"
)

func MurmurHash3(text string, seed uint32) uint32 {
	data := []byte(text)
	h := seed
	i := 0
	mix := func(k uint32) uint32 { k *= 0xcc9e2d51; k = bits.RotateLeft32(k, 15); return k * 0x1b873593 }
	for i+4 <= len(data) {
		h ^= mix(binary.LittleEndian.Uint32(data[i:]))
		h = bits.RotateLeft32(h, 13)*5 + 0xe6546b64
		i += 4
	}
	var tail uint32
	for j := i; j < len(data); j++ {
		tail |= uint32(data[j]) << uint((j-i)*8)
	}
	if i < len(data) {
		h ^= mix(tail)
	}
	h ^= uint32(len(data))
	h ^= h >> 16
	h *= 0x85ebca6b
	h ^= h >> 13
	h *= 0xc2b2ae35
	h ^= h >> 16
	return h
}
func XYDirection(userID string) uint32 {
	if userID == "" {
		return 0
	}
	return MurmurHash3(userID, 151488)%100 + 1
}
func GenerateSearchID(now int64, sample float64, existing string) (string, error) {
	if existing != "" {
		return existing, nil
	}
	part, e := searchRandom(sample)
	if e != nil || now < 0 {
		if e == nil {
			e = fmt.Errorf("search timestamp must be non-negative")
		}
		return "", e
	}
	n := new(big.Int).Lsh(big.NewInt(now), 64)
	n.Add(n, big.NewInt(part))
	return n.Text(36), nil
}
func GenerateSearchRequestID(now int64, sample float64) (string, error) {
	n, e := searchRandom(sample)
	if e != nil {
		return "", e
	}
	return strconv.FormatInt(n, 10) + "-" + strconv.FormatInt(now, 10), nil
}
func searchRandom(sample float64) (int64, error) {
	if math.IsNaN(sample) || sample < 0 || sample >= 1 {
		return 0, fmt.Errorf("random sample must be in [0,1)")
	}
	return int64(math.Ceil(0x7ffffffe * sample)), nil
}
func randomUint32(r io.Reader) (uint32, error) {
	var b [4]byte
	_, e := io.ReadFull(r, b[:])
	return binary.LittleEndian.Uint32(b[:]), e
}
func GenerateUUID(r io.Reader) (string, error) {
	var b [16]byte
	if _, e := io.ReadFull(r, b[:]); e != nil {
		return "", e
	}
	b[6] = (b[6] & 15) | 64
	b[8] = (b[8] & 63) | 128
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[:4], b[4:6], b[6:8], b[8:10], b[10:]), nil
}
func traceID(r io.Reader) (string, error) {
	b := make([]byte, 16)
	if _, e := io.ReadFull(r, b); e != nil {
		return "", e
	}
	for i, v := range b {
		b[i] = "abcdef0123456789"[v&15]
	}
	return string(b), nil
}
func xrayID(now int64, seq uint32, r io.Reader) (string, error) {
	var b [8]byte
	if _, e := io.ReadFull(r, b[:]); e != nil {
		return "", e
	}
	return fmt.Sprintf("%016x%016x", (uint64(now)<<23)|uint64(seq&0x7fffff), binary.BigEndian.Uint64(b[:])), nil
}

// SpliceQuery retains input order and repeated parameters, matching urlencode.
func SpliceQuery(api string, params Object) (string, error) {
	parts := []string{}
	add := func(key string, value any) {
		text := ""
		if value != nil {
			text = jsText(value)
		}
		parts = append(parts, url.QueryEscape(key)+"="+url.QueryEscape(text))
	}
	for _, f := range params {
		if list, ok := f.Value.([]any); ok {
			for _, v := range list {
				add(f.Name, v)
			}
		} else {
			add(f.Name, f.Value)
		}
	}
	if strings.Contains(api, "?") {
		return "", fmt.Errorf("query already present")
	}
	return api + "?" + strings.Join(parts, "&"), nil
}
