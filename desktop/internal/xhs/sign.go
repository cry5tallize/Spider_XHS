package xhs

import (
	"crypto/md5"
	"crypto/rand"
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"hash/crc32"
	"io"
	"strconv"
	"strings"
	"time"
	"unicode/utf16"
)

type SignInput struct {
	API                                                     string
	Body                                                    Body
	Cookie                                                  string
	Context                                                 MNSInput
	Tier                                                    string
	XT                                                      int64
	B1, DSLPair, WebBuild, SignVersion, Platform, B1Version string
	SignCount                                               int
	WebSSK                                                  any
	SSKRandom, SSKTimestamp                                 *uint32
	Random                                                  io.Reader
}
type Signature struct {
	X3       string `json:"x3"`
	XS       string `json:"xs"`
	XT       string `json:"xt"`
	Length   int    `json:"len"`
	Prefix   string `json:"prefix"`
	Tier     string `json:"tier"`
	Pure     bool   `json:"pure"`
	XSCommon string `json:"xs_common,omitempty"`
}

func SignRequest(input SignInput) (Signature, error) {
	if input.API == "" {
		return Signature{}, fmt.Errorf("sign API required")
	}
	if input.Body.Kind != BodyEmpty && input.Body.Kind != BodyString && input.Body.Kind != BodyObject {
		return Signature{}, fmt.Errorf("invalid body kind")
	}
	if input.Body.Kind == BodyEmpty && len(input.Body.Bytes) > 0 {
		return Signature{}, fmt.Errorf("empty body kind with non-empty bytes")
	}
	cookies := ParseCookie(input.Cookie)
	a1 := jsText(cookies.Get("a1"))
	if cookies.Get("a1") == nil || a1 == "" {
		return Signature{}, fmt.Errorf("cookie a1 required")
	}
	p := input.Context
	p.API = input.API
	p.Data = string(input.Body.Bytes)
	p.A1 = a1
	if p.AppID == "" {
		p.AppID = "xhs-pc-web"
	}
	tier := input.Tier
	if tier == "" {
		tier = "0301"
	}
	x3, e := SignMNS(p, tier)
	if e != nil {
		return Signature{}, e
	}
	version, platform := input.SignVersion, input.Platform
	if version == "" {
		version = "4.4.3"
	}
	if platform == "" {
		platform = "Windows"
	}
	x4 := string(input.Body.Kind)
	if len(input.Body.Bytes) == 0 {
		x4 = ""
	}
	envelope := Object{{"x0", version}, {"x1", p.AppID}, {"x2", platform}, {"x3", x3}, {"x4", x4}}
	fullHash := md5.Sum(append([]byte(input.API), input.Body.Bytes...))
	if p.AppID == "xhs-pc-web" {
		envelope = append(envelope, Field{"x5", hex.EncodeToString(fullHash[:])})
		secret := webSSK(input.WebSSK, p.AppID)
		if len(secret) >= 32 {
			random := input.Random
			if random == nil {
				random = rand.Reader
			}
			var r [4]byte
			if input.SSKRandom != nil {
				binary.LittleEndian.PutUint32(r[:], *input.SSKRandom)
			} else if _, e = io.ReadFull(random, r[:]); e != nil {
				return Signature{}, fmt.Errorf("SSK random: %w", e)
			}
			ts := uint32(time.Now().UnixMilli())
			if input.SSKTimestamp != nil {
				ts = *input.SSKTimestamp
			}
			nonce := binary.LittleEndian.AppendUint32(nil, ts+binary.LittleEndian.Uint32(r[:]))
			digest := sha1.Sum(append(append([]byte{}, secret...), nonce...))
			enc := append(nonce, digest[:]...)
			enc = append(enc, secret[32:]...)
			signed := sha1.Sum(append(append([]byte{}, fullHash[:]...), enc...))
			envelope = append(envelope, Field{"x6", Object{{p.AppID, base64.StdEncoding.EncodeToString(signed[:])}}}, Field{"x7", Object{{p.AppID, base64.StdEncoding.EncodeToString(enc)}}})
		}
	}
	encoded, e := EncodeJSON(envelope)
	if e != nil {
		return Signature{}, e
	}
	xs := "XYS_" + xsEncoding.EncodeToString(encoded)
	xt := input.XT
	if xt == 0 {
		xt = time.Now().UnixMilli()
	}
	out := Signature{x3, xs, strconv.FormatInt(xt, 10), len(x3), x3[:min(12, len(x3))], tier, true, ""}
	if input.DSLPair != "" {
		build := input.WebBuild
		if build == "" && cookies.Get("webBuild") != nil {
			build = jsText(cookies.Get("webBuild"))
		}
		if build == "" {
			return Signature{}, fmt.Errorf("webBuild required for X-S-Common")
		}
		b1version := input.B1Version
		if b1version == "" {
			b1version = "1"
		}
		var b1 any = input.B1
		crcInput := input.B1
		if input.B1 == "" {
			b1 = nil
			crcInput = "null"
		}
		common := Object{{"s0", 5}, {"s1", ""}, {"x0", b1version}, {"x1", version}, {"x2", platform}, {"x3", p.AppID}, {"x4", build}, {"x5", a1}, {"x6", ""}, {"x7", ""}, {"x8", b1}, {"x9", GenS9(crcInput)}, {"x10", input.SignCount}, {"x11", "normal"}, {"x12", input.DSLPair}}
		data, e := EncodeJSON(common)
		if e != nil {
			return Signature{}, e
		}
		out.XSCommon = xsEncoding.EncodeToString(data)
	}
	return out, nil
}
func webSSK(value any, appID string) []byte {
	if s, ok := value.(string); ok {
		v, e := ParseJSON([]byte(s))
		if e != nil {
			return nil
		}
		value = v
	}
	o := object(value)
	if s, ok := o.Get(appID).(string); ok {
		data, e := base64.StdEncoding.DecodeString(s)
		if e == nil && len(data) >= 32 {
			return data
		}
	}
	return nil
}
func GenS9(text string) int32 {
	c := uint32(0xffffffff)
	table := crc32.MakeTable(crc32.IEEE)
	for _, u := range utf16.Encode([]rune(text)) {
		index := (c & 255) ^ uint32(u)
		value := uint32(0)
		if index < 256 {
			value = table[index]
		}
		c = value ^ (c >> 8)
	}
	return int32(^c ^ uint32(crc32.IEEE))
}
func ParseCookie(header string) Object {
	out := Object{}
	for _, part := range strings.Split(header, ";") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		name, value, _ := strings.Cut(part, "=")
		name = strings.TrimSpace(name)
		if name != "" {
			out.Set(name, value)
		}
	}
	return out
}
