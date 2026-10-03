package xhs

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestMNSReference(t *testing.T) {
	for i, c := range loadReference(t).MNS {
		t.Run(string(rune('A'+i)), func(t *testing.T) {
			var p MNSInput
			if e := json.Unmarshal(c.Input, &p); e != nil {
				t.Fatal(e)
			}
			packed, e := PackMNS(p)
			if e != nil {
				t.Fatal(e)
			}
			compareHex(t, "mns pack", packed, c.PackHex)
			got, e := SignMNS(p, c.Tier)
			if e != nil {
				t.Fatal(e)
			}
			if got != c.Expected {
				t.Fatalf("mns%s differs\ngot  %s\nwant %s", c.Tier, got, c.Expected)
			}
		})
	}
}
func TestSignReference(t *testing.T) {
	for i, c := range loadReference(t).Signs {
		t.Run(string(rune('A'+i)), func(t *testing.T) {
			o := parseObject(t, c.Input)
			body := Body{}
			var e error
			if value := o.Get("data"); value != nil {
				if text, ok := value.(string); ok {
					body = TextBody(text)
				} else {
					body, e = JSONBody(value)
					if e != nil {
						t.Fatal(e)
					}
				}
			}
			tail := []byte{}
			for _, v := range o.Get("envFpTail").([]any) {
				tail = append(tail, byte(number(v)))
			}
			input := SignInput{API: jsText(o.Get("api")), Body: body, Cookie: jsText(o.Get("cookie")), Tier: jsText(o.Get("tier")), XT: int64(number(o.Get("xt"))), B1: jsText(o.Get("b1")), DSLPair: jsText(o.Get("dslPair")), WebBuild: jsText(o.Get("webBuild")), SignCount: int(number(o.Get("signCount"))), WebSSK: o.Get("webSsk"), Context: MNSInput{TimestampMS: int64(number(o.Get("now"))), LoadTimestampMS: int64(number(o.Get("loadts"))), Version: uint32(number(o.Get("version"))), Sequence: uint32(number(o.Get("seq"))), EnvironmentConstant: uint32(number(o.Get("envConst"))), EnvironmentTail: tail, DeviceTag: jsText(o.Get("deviceTag"))}}
			if o.Has("sskRandom") {
				v := uint32(number(o.Get("sskRandom")))
				input.SSKRandom = &v
			}
			if o.Has("sskTimestamp") {
				v := uint32(number(o.Get("sskTimestamp")))
				input.SSKTimestamp = &v
			}
			got, e := SignRequest(input)
			if e != nil {
				t.Fatal(e)
			}
			var want Signature
			if e = json.Unmarshal(c.Expected, &want); e != nil {
				t.Fatal(e)
			}
			if !reflect.DeepEqual(got, want) {
				t.Fatalf("signature differs\ngot  %+v\nwant %+v", got, want)
			}
		})
	}
}
func TestMNSRejectsInvalidMaterial(t *testing.T) {
	p := MNSInput{A1: "test", EnvironmentTail: make([]byte, 14)}
	if _, e := SignMNS(p, "9999"); e == nil {
		t.Fatal("unknown tier accepted")
	}
	p.EnvironmentTail = nil
	if _, e := SignMNS(p, "0301"); e == nil {
		t.Fatal("missing environment accepted")
	}
}
