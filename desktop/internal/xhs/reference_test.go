package xhs

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"os"
	"testing"
)

type referenceData struct {
	JSON []struct{ Input, Expected string } `json:"json"`
	B1   []struct {
		Input                   json.RawMessage
		MiniJSON, CipherHex, B1 string
	} `json:"b1"`
	MNS []struct {
		Input                   json.RawMessage
		Tier, PackHex, Expected string
	} `json:"mns"`
	Signs []struct {
		Input    json.RawMessage
		Expected json.RawMessage
	} `json:"signs"`
	Compression []struct {
		InputHex, GzipHex string
		Mtime             uint32
	} `json:"compression"`
	Ciphers []struct{ InputHex, CipherHex string } `json:"ciphers"`
	RAP     []struct {
		Input                                                 json.RawMessage
		Expected, PlaintextHex, EncRHex, BodyHex, EnvelopeHex string
	} `json:"rap"`
}

func loadReference(t *testing.T) referenceData {
	t.Helper()
	data, e := os.ReadFile("testdata/reference.json")
	if e != nil {
		t.Fatal(e)
	}
	var r referenceData
	if e = json.Unmarshal(data, &r); e != nil {
		t.Fatal(e)
	}
	return r
}
func parseObject(t *testing.T, raw []byte) Object {
	t.Helper()
	v, e := ParseJSON(raw)
	if e != nil {
		t.Fatal(e)
	}
	o, ok := v.(Object)
	if !ok {
		t.Fatal("expected object")
	}
	return o
}
func hexBytes(t *testing.T, s string) []byte {
	t.Helper()
	v, e := hex.DecodeString(s)
	if e != nil {
		t.Fatal(e)
	}
	return v
}
func compareHex(t *testing.T, name string, got []byte, want string) {
	t.Helper()
	if !bytes.Equal(got, hexBytes(t, want)) {
		t.Fatalf("%s differs\ngot  %x\nwant %s", name, got, want)
	}
}
func TestOrderedJSONReference(t *testing.T) {
	for _, c := range loadReference(t).JSON {
		v, e := ParseJSON([]byte(c.Input))
		if e != nil {
			t.Fatal(e)
		}
		got, e := EncodeJSON(v)
		if e != nil {
			t.Fatal(e)
		}
		if string(got) != c.Expected {
			t.Fatalf("JSON: got %s want %s", got, c.Expected)
		}
	}
}
func TestB1Reference(t *testing.T) {
	for i, c := range loadReference(t).B1 {
		t.Run(string(rune('A'+i)), func(t *testing.T) {
			got, e := GenerateB1(parseObject(t, c.Input))
			if e != nil {
				t.Fatal(e)
			}
			if got.PlainJSON != c.MiniJSON {
				t.Fatalf("mini JSON differs\ngot  %s\nwant %s", got.PlainJSON, c.MiniJSON)
			}
			compareHex(t, "b1 cipher", got.Cipher, c.CipherHex)
			if got.B1 != c.B1 {
				t.Fatal("b1 encoding differs")
			}
		})
	}
}
func TestJSONRejectsUnorderedMap(t *testing.T) {
	if _, e := EncodeJSON(map[string]any{"x": 1}); e == nil {
		t.Fatal("map must not silently lose caller order")
	}
}
func TestDecodeInvalidB1(t *testing.T) {
	for _, s := range []string{"?", "====", "abc"} {
		if _, e := DecodeB1(s); e == nil {
			t.Fatalf("accepted invalid b1 %q", s)
		}
	}
}

func TestBodyTypeSemantics(t *testing.T) {
	empty, e := JSONBody(nil)
	if e != nil || empty.Kind != BodyEmpty || len(empty.Bytes) != 0 {
		t.Fatal("null input must match the source empty-body path")
	}
	body, e := JSONBody(Object{{"image_formats", []string{"jpg", "webp"}}})
	if e != nil || string(body.Bytes) != `{"image_formats":["jpg","webp"]}` || body.Kind != BodyObject {
		t.Fatal("object/array body changed", e)
	}
	if _, e = JSONBody("raw text"); e == nil {
		t.Fatal("use TextBody to preserve the source string type")
	}
	var object Object
	if e = json.Unmarshal([]byte(`{"z":1,"a":2}`), &object); e != nil {
		t.Fatal(e)
	}
	encoded, e := json.Marshal(object)
	if e != nil || string(encoded) != `{"z":1,"a":2}` {
		t.Fatal("standard JSON integration lost object shape", e)
	}
}
