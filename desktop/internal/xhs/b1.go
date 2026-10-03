package xhs

import (
	"encoding/base64"
	"fmt"
	"strings"
	"time"
	"unicode/utf16"
)

const xsAlphabet = "ZmserbBoHQtNP+wOcza/LpngG8yJq42KWYj0DSfdikx3VT16IlUAFM97hECvuRX5"
const b1Key = "xhswebmplfbt"

var xsEncoding = base64.NewEncoding(xsAlphabet)
var miniKeys = []string{"x33", "x34", "x35", "x36", "x37", "x38", "x39", "x42", "x43", "x44", "x45", "x46", "x48", "x49", "x50", "x51", "x52", "x82", "x84"}

const defaultX37 = "0|0|0|0|0|0|0|0|0|1|0|0|1|0|0|0|0|1|1|0|0|0|0|0"
const defaultX38 = "0|0|1|0|1|0|0|0|0|0|1|0|1|0|1|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0"
const defaultX82 = "1|_BHjFmfUMEtxhI|_AUuXfEG27Xa3x|__xhsPendingNotePoint25300ReportMap|__xhsReportedNotePoint25300RecordMap|setImDebugMode|anti_hp_sign_config|__rap_app_id__|__rap_report__|__rap_last_sign_cost__|__rap_last_transform_cost__|__rap_hijack_installed__|__ed1a7dddf7c818e4bd|__hp_xhs_search_input_state__|__h"

type B1Result struct {
	B1        string
	Mini      Object
	PlainJSON string
	Cipher    []byte
}

func GenerateB1(options Object) (B1Result, error) {
	mini := BuildMiniFields(options)
	ordered := Object{}
	for _, key := range miniKeys {
		if mini.Has(key) {
			ordered = append(ordered, Field{key, mini.Get(key)})
		}
	}
	plain, e := EncodeJSON(ordered)
	if e != nil {
		return B1Result{}, e
	}
	cipher := rc4StringUTF8(string(plain), b1Key)
	return B1Result{xsEncoding.EncodeToString(cipher), mini, string(plain), cipher}, nil
}
func DecodeB1(value string) (Object, error) {
	data, e := xsEncoding.DecodeString(value)
	if e != nil {
		return nil, fmt.Errorf("decode b1: %w", e)
	}
	plain := rc4StringUTF8(string(data), b1Key)
	v, e := ParseJSON(plain)
	if e != nil {
		return nil, fmt.Errorf("decode b1 JSON: %w", e)
	}
	o, ok := v.(Object)
	if !ok {
		return nil, fmt.Errorf("b1 must contain an object")
	}
	return o, nil
}

// The source RC4 XORs UTF-16 code units, then Buffer encodes the resulting
// JS string as UTF-8. Applying byte-oriented RC4 to UTF-8 input is different.
func rc4StringUTF8(text, key string) []byte {
	u := utf16.Encode([]rune(text))
	k := utf16.Encode([]rune(key))
	var state [256]int
	for i := range state {
		state[i] = i
	}
	j := 0
	for i := range state {
		j = (j + state[i] + int(k[i%len(k)])) & 255
		state[i], state[j] = state[j], state[i]
	}
	i, j := 0, 0
	for n, c := range u {
		i = (i + 1) & 255
		j = (j + state[i]) & 255
		state[i], state[j] = state[j], state[i]
		u[n] = c ^ uint16(state[(state[i]+state[j])&255])
	}
	return []byte(string(utf16.Decode(u)))
}
func BuildMiniFields(options Object) Object {
	now := fallback(options, "now", time.Now().UnixMilli())
	x82 := jsText(fallback(options, "x82", defaultX82))
	if keys, ok := options.Get("windowKeys").([]any); ok {
		parts := make([]string, len(keys))
		for i, k := range keys {
			parts[i] = jsText(k)
		}
		x82 = "1|" + strings.Join(parts, "|")
	}
	units := utf16.Encode([]rune(x82))
	if len(units) > 300 {
		units = units[:300]
	}
	telemetry := merge(object(options.Get("telemetry")), Object{{"now", now}})
	fields := Object{
		{"x33", "0"}, {"x34", "0"}, {"x35", "0"}, {"x36", jsText(fallback(options, "frameCount", 2))},
		{"x37", defaultX37}, {"x38", defaultX38}, {"x39", jsText(fallback(options, "x39", "22"))},
		{"x42", jsText(fallback(options, "sdkVersion", "3.5.6"))}, {"x43", jsText(fallback(options, "canvasFingerprint", "Canvas not supported"))},
		{"x44", jsText(now)}, {"x45", jsText(fallback(options, "secCanvas", "__SEC_CAV__1-1-1-1-1|"))},
		{"x46", jsText(fallback(options, "webdriver", false))}, {"x48", jsText(fallback(options, "x48", ""))},
		{"x49", jsText(fallback(options, "x49", "{list:[],type:}"))}, {"x50", jsText(fallback(options, "x50", fallback(options, "globalCount", "131,88,103")))},
		{"x51", jsText(fallback(options, "x51", ""))}, {"x52", jsText(fallback(options, "x52", ""))},
		{"x82", jsUnits(units)}, {"x84", jsText(fallback(options, "x84", FormatTelemetry(telemetry)))},
	}
	return merge(fields, object(options.Get("overrides")))
}
func FormatTelemetry(options Object) string {
	now := number(fallback(options, "now", time.Now().UnixMilli()))
	origin := fallback(options, "timeOrigin", now-number(fallback(options, "sessionAgeMs", 2151.1)))
	profile := jsText(options.Get("profile"))
	active := profile == "active" || profile == "legacy-active"
	mouse, page, features := Object{}, Object{{"ulr", 2}, {"ps", 1}}, Object{{"ae", nil}, {"ak", nil}, {"cdr", nil}, {"bf", nil}, {"fi", nil}}
	if active {
		mouse = Object{{"me", 50}, {"mm", 50}, {"md", 1}, {"mu", 1}, {"c", 1}}
		page = Object{{"ulr", 1}, {"ps", 1}, {"f", 3}, {"b", 3}, {"vc", 0}, {"rs", 1}, {"sc", 0}}
		features = Object{{"ae", 3.3656015629507223}, {"ak", 6.231183732330187}, {"cdr", 0.4096814442007536}, {"bf", Object{{"ar", 0.6210873146622735}, {"fr", 7.158084478545331}}}, {"fi", number(fallback(options, "firstInteraction", 2151.1))}}
	}
	mouse = merge(mouse, object(options.Get("mouse")))
	page = merge(page, object(options.Get("page")))
	features = merge(features, object(options.Get("features")))
	state := merge(Object{{"h", 0}, {"f", 1}, {"kr", 0}}, object(options.Get("state")))
	bf := "null"
	if value := features.Get("bf"); value != nil {
		o := object(value)
		bf = "{ar:" + jsText(o.Get("ar")) + ",fr:" + jsText(o.Get("fr")) + "}"
	}
	return "{mt:{to:" + jsText(origin) + "},m:{" + mapText(mouse) + "},k:{" + mapText(object(options.Get("keyboard"))) + "},p:{" + mapText(page) + "},st:{" + mapText(state) + "},ft:{ae:" + jsText(features.Get("ae")) + ",ak:" + jsText(features.Get("ak")) + ",cdr:" + jsText(features.Get("cdr")) + ",bf:" + bf + ",fi:" + jsText(features.Get("fi")) + "}}"
}
func mapText(o Object) string {
	parts := []string{}
	for _, f := range orderedFields(o) {
		parts = append(parts, f.Name+":"+jsText(f.Value))
	}
	return strings.Join(parts, ",")
}
