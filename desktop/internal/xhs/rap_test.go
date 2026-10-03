package xhs

import (
	"bytes"
	"compress/gzip"
	"encoding/binary"
	"io"
	"math/rand"
	"testing"
)

func gunzip(t *testing.T, data []byte) []byte {
	t.Helper()
	r, e := gzip.NewReader(bytes.NewReader(data))
	if e != nil {
		t.Fatal(e)
	}
	out, e := io.ReadAll(r)
	if e != nil {
		t.Fatal(e)
	}
	if e = r.Close(); e != nil {
		t.Fatal(e)
	}
	return out
}
func TestCompressionReference(t *testing.T) {
	for i, c := range loadReference(t).Compression {
		t.Run(string(rune('A'+i)), func(t *testing.T) {
			input := hexBytes(t, c.InputHex)
			got, e := EncodeGzip(input, c.Mtime)
			if e != nil {
				t.Fatal(e)
			}
			compareHex(t, "gzip", got, c.GzipHex)
			if !bytes.Equal(gunzip(t, got), input) {
				t.Fatal("gzip did not round trip")
			}
		})
	}
}
func TestCompressionWindowBoundaries(t *testing.T) {
	r := rand.New(rand.NewSource(123))
	for _, size := range []int{0, 1, 2, 3, 4, 5, 16, 17, 127, 128, 129, 256, 257, 512, 2048, 8192} {
		for _, repeated := range []bool{false, true} {
			input := make([]byte, size)
			_, _ = r.Read(input)
			if repeated {
				for i := range input {
					input[i] = byte(i % 7)
				}
			}
			got, e := EncodeGzip(input, 0)
			if e != nil {
				t.Fatal(e)
			}
			if !bytes.Equal(gunzip(t, got), input) {
				t.Fatalf("round trip failed for %d bytes", size)
			}
		}
	}
}
func TestCipherReference(t *testing.T) {
	for _, c := range loadReference(t).Ciphers {
		input := hexBytes(t, c.InputHex)
		got, e := rapECB(input, false)
		if e != nil {
			t.Fatal(e)
		}
		compareHex(t, "cipher", got, c.CipherHex)
		plain, e := rapECB(got, true)
		if e != nil {
			t.Fatal(e)
		}
		if !bytes.Equal(plain, input) {
			t.Fatal("cipher did not round trip")
		}
	}
}
func TestRAPReference(t *testing.T) {
	for i, c := range loadReference(t).RAP {
		t.Run(string(rune('A'+i)), func(t *testing.T) {
			o := parseObject(t, c.Input)
			mask := byte(number(o.Get("mask")))
			elapsed := uint32(number(o.Get("bodyEncryTime")))
			key := []byte(jsText(o.Get("xorKey")))
			input := RAPInput{API: jsText(o.Get("api")), Body: []byte(jsText(o.Get("data"))), Fingerprint: hexBytes(t, jsText(o.Get("fingerprintHex"))), TimestampMS: int64(number(o.Get("ts"))), Mask: &mask, XORKey: key, Nonce: []byte(jsText(o.Get("nonce"))), MTime: uint32(number(o.Get("mtime"))), Padding: hexBytes(t, jsText(o.Get("padHex"))), BodyEncryptTime: &elapsed}
			got, e := BuildRAP(input)
			if e != nil {
				t.Fatal(e)
			}
			compareHex(t, "plaintext", got.Plaintext, c.PlaintextHex)
			compareHex(t, "encR", got.EncR, c.EncRHex)
			compareHex(t, "cipher", got.Cipher, c.BodyHex)
			compareHex(t, "envelope", got.Envelope, c.EnvelopeHex)
			if got.Value != c.Expected {
				t.Fatal("RAP encoding differs")
			}
			decoded, e := rapECB(got.Cipher, true)
			if e != nil {
				t.Fatal(e)
			}
			for i := range decoded {
				decoded[i] ^= key[i%16]
			}
			if !bytes.Equal(gunzip(t, decoded[:got.GzipLength]), got.Plaintext) {
				t.Fatal("RAP payload did not round trip")
			}
			if XXHash32(got.Envelope[36:], 0) != binary.BigEndian.Uint32(got.Envelope[16:]) {
				t.Fatal("RAP checksum invalid")
			}
		})
	}
}
