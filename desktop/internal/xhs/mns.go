package xhs

import (
	"crypto/md5"
	"encoding/base64"
	"encoding/binary"
	"fmt"
	"math/big"
	"math/bits"
	"unicode/utf16"
)

const mnsAlphabet = "MfgqrsbcyzPQRStuvC7mn501HIJBo2DEFTKdeNOwxWXYZap89+/A4UVLhijkl63G"
const mns58Alphabet = "NOPQRStuvwxWXYZabcyz012DEFTKLMdefghijkl4563GHIJBC7mnop89+/"
const mns0201Delta uint32 = 1013904243

var mnsEncoding = base64.NewEncoding(mnsAlphabet)
var mnsStream = resourceBytes("mns_keystreams.json", "b64")
var mns0101Stream = resourceBytes("mns_0101_keystream.json", "b64")

type MNSInput struct {
	API                 string `json:"api"`
	Data                string `json:"data"`
	A1                  string `json:"a1"`
	TimestampMS         int64  `json:"ts"`
	LoadTimestampMS     int64  `json:"loadts"`
	Version             uint32 `json:"version"`
	Sequence            uint32 `json:"seq"`
	EnvironmentConstant uint32 `json:"envConst"`
	EnvironmentTail     []byte `json:"envFpTail"`
	AppID               string `json:"appId"`
	DeviceTag           string `json:"deviceTag"`
	DSSignature         []byte `json:"dsSigBytes"`
}

func PackMNS(p MNSInput) ([]byte, error) {
	if p.A1 == "" {
		return nil, fmt.Errorf("mns a1 required")
	}
	if len(p.EnvironmentTail) != 14 {
		return nil, fmt.Errorf("mns environment tail must be 14 bytes")
	}
	if p.AppID == "" {
		p.AppID = "xhs-pc-web"
	}
	if p.DeviceTag == "" {
		p.DeviceTag = "a3"
	}
	a1len := len(utf16.Encode([]rune(p.A1)))
	if a1len > 255 || len(p.AppID) > 255 || len(p.DeviceTag) > 255 {
		return nil, fmt.Errorf("mns string field exceeds one-byte length")
	}
	full := p.API + p.Data
	fullHash := md5.Sum([]byte(full))
	apiHash := md5.Sum([]byte(p.API))
	key := byte(p.Version)
	ds := p.DSSignature
	if p.DeviceTag == "nop" {
		ds = apiHash[:]
	} else if ds == nil {
		input := binary.LittleEndian.AppendUint64(nil, uint64(p.TimestampMS))
		input = append(input, apiHash[:]...)
		ds = DSHash(input)
	}
	if len(ds) != 16 {
		return nil, fmt.Errorf("mns DS signature must be 16 bytes")
	}
	out := []byte{121, 104, 96, 41}
	out = binary.LittleEndian.AppendUint32(out, p.Version)
	out = binary.LittleEndian.AppendUint64(out, uint64(p.TimestampMS))
	out = binary.LittleEndian.AppendUint64(out, uint64(p.LoadTimestampMS))
	out = binary.LittleEndian.AppendUint32(out, p.Sequence)
	out = binary.LittleEndian.AppendUint32(out, p.EnvironmentConstant)
	out = binary.LittleEndian.AppendUint32(out, uint32(len(full)))
	for _, b := range fullHash[:8] {
		out = append(out, b^key)
	}
	out = append(out, byte(a1len))
	out = append(out, []byte(p.A1)...)
	out = append(out, byte(len(p.AppID)))
	out = append(out, []byte(p.AppID)...)
	out = append(out, 1, key^115)
	out = append(out, p.EnvironmentTail...)
	out = append(out, byte(len(p.DeviceTag)))
	out = append(out, []byte(p.DeviceTag)...)
	out = append(out, 16)
	for _, b := range ds {
		out = append(out, b^key)
	}
	return out, nil
}
func DSHash(data []byte) []byte {
	n := uint32(len(data))
	h1, h2, h3, h4 := uint32(0x6d2b79f5)^n, uint32(0x1b873593)^(n<<8), uint32(0x85ebca6b)^(n<<16), uint32(0xc2b2ae35)^(n<<24)
	for i := 0; i+8 <= len(data); i += 8 {
		w0, w1 := binary.LittleEndian.Uint32(data[i:]), binary.LittleEndian.Uint32(data[i+4:])
		h1 = bits.RotateLeft32((h1+w0)^h3, 7)
		h2 = bits.RotateLeft32((h2^w0)+h4, 11)
		h3 = bits.RotateLeft32((h3+w1)^h1, 13)
		h4 = bits.RotateLeft32((h4^w1)+h2, 17)
	}
	h1 ^= n
	h2 ^= h1
	h3 += h2
	h4 ^= h3
	h1 = bits.RotateLeft32(h1, 9)
	h2 = bits.RotateLeft32(h2, 13)
	h3 = bits.RotateLeft32(h3, 17)
	h4 = bits.RotateLeft32(h4, 19)
	h1 += h3
	h2 ^= h4
	h3 += h1
	h4 ^= h2
	out := []byte{}
	for _, h := range []uint32{h1, h2, h3, h4} {
		out = binary.LittleEndian.AppendUint32(out, h)
	}
	return out
}
func SignMNS(p MNSInput, tier string) (string, error) {
	plain, e := PackMNS(p)
	if e != nil {
		return "", e
	}
	if tier == "" {
		tier = "0301"
	}
	switch tier {
	case "0301", "0101":
		stream := mnsStream
		if tier == "0101" {
			stream = mns0101Stream
		}
		if len(plain) > len(stream) {
			return "", fmt.Errorf("mns%s input exceeds extracted keystream", tier)
		}
		for i := range plain {
			plain[i] ^= stream[i]
		}
		if tier == "0101" {
			return "mns0101_" + base58(plain), nil
		}
		return "mns0301_" + mnsEncoding.EncodeToString(plain), nil
	case "0201":
		return "mns0201_" + mnsEncoding.EncodeToString(encrypt0201(plain)), nil
	default:
		return "", fmt.Errorf("unsupported mns tier %q", tier)
	}
}
func base58(data []byte) string {
	value := new(big.Int).SetBytes(data)
	radix := big.NewInt(58)
	rem := new(big.Int)
	out := []byte{}
	for value.Sign() > 0 {
		value.QuoRem(value, radix, rem)
		out = append(out, mns58Alphabet[rem.Int64()])
	}
	for _, b := range data {
		if b != 0 {
			break
		}
		out = append(out, '1')
	}
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return string(out)
}
func encrypt0201(data []byte) []byte {
	v := make([]uint32, (len(data)+3)/4+1)
	for i, b := range data {
		v[i/4] |= uint32(b) << uint((i%4)*8)
	}
	v[len(v)-1] = uint32(len(data))
	key := []byte("e6483ca2a1eed5e3")
	var k [4]uint32
	for i := range k {
		k[i] = binary.LittleEndian.Uint32(key[4*i:])
	}
	n := len(v)
	sum, z := uint32(0), v[n-1]
	mx := func(y, z uint32, p int, e uint32) uint32 {
		return ((z>>5 ^ y<<2) + (y>>3 ^ z<<4)) ^ ((sum ^ y) + (k[uint32(p&3)^e] ^ z))
	}
	for rounds := 6 + 52/n; rounds > 0; rounds-- {
		sum += mns0201Delta
		e := (sum >> 2) & 3
		for p := 0; p < n-1; p++ {
			v[p] += mx(v[p+1], z, p, e)
			z = v[p]
		}
		v[n-1] += mx(v[0], z, n-1, e)
		z = v[n-1]
	}
	out := []byte{}
	for _, w := range v {
		out = binary.LittleEndian.AppendUint32(out, w)
	}
	return out
}
