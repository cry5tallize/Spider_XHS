package xhs

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"sort"
	"strconv"
	"strings"
	"unicode/utf16"
	"unicode/utf8"
)

// Object preserves insertion order; integer property names follow JS ordering.
// Use it instead of maps when JSON bytes participate in a signature.
type Object []Field
type Field struct {
	Name  string
	Value any
}
type jsUnits []uint16

func (o Object) MarshalJSON() ([]byte, error) { return EncodeJSON(o) }
func (o *Object) UnmarshalJSON(data []byte) error {
	v, err := ParseJSON(data)
	if err != nil {
		return err
	}
	value, ok := v.(Object)
	if !ok {
		return fmt.Errorf("expected JSON object")
	}
	*o = value
	return nil
}

func (o Object) Get(name string) any {
	for i := len(o) - 1; i >= 0; i-- {
		if o[i].Name == name {
			return o[i].Value
		}
	}
	return nil
}
func (o Object) Has(name string) bool {
	for _, f := range o {
		if f.Name == name {
			return true
		}
	}
	return false
}
func (o *Object) Set(name string, value any) {
	for i := range *o {
		if (*o)[i].Name == name {
			(*o)[i].Value = value
			return
		}
	}
	*o = append(*o, Field{name, value})
}
func object(value any) Object { o, _ := value.(Object); return o }
func merge(base, extra Object) Object {
	o := append(Object(nil), base...)
	for _, f := range extra {
		o.Set(f.Name, f.Value)
	}
	return o
}

// ParseJSON preserves object order, unlike decoding into map[string]any.
func ParseJSON(data []byte) (any, error) {
	d := json.NewDecoder(bytes.NewReader(data))
	d.UseNumber()
	v, err := parseValue(d, data)
	if err != nil {
		return nil, err
	}
	if _, err = d.Token(); err != io.EOF {
		if err == nil {
			err = fmt.Errorf("trailing JSON value")
		}
		return nil, err
	}
	return v, nil
}
func parseValue(d *json.Decoder, source []byte) (any, error) {
	start := d.InputOffset()
	t, err := d.Token()
	if err != nil {
		return nil, err
	}
	if delim, ok := t.(json.Delim); ok {
		switch delim {
		case '{':
			o := Object{}
			for d.More() {
				k, e := d.Token()
				if e != nil {
					return nil, e
				}
				v, e := parseValue(d, source)
				if e != nil {
					return nil, e
				}
				o.Set(k.(string), v)
			}
			_, err = d.Token()
			return o, err
		case '[':
			a := []any{}
			for d.More() {
				v, e := parseValue(d, source)
				if e != nil {
					return nil, e
				}
				a = append(a, v)
			}
			_, err = d.Token()
			return a, err
		default:
			return nil, fmt.Errorf("unexpected JSON delimiter")
		}
	}
	if n, ok := t.(json.Number); ok {
		return n.Float64()
	}
	if _, ok := t.(string); ok {
		fragment := source[start:d.InputOffset()]
		return parseStringUnits(fragment[bytes.IndexByte(fragment, '"'):])
	}
	return t, nil
}

// JSON's escaped lone surrogate is valid in JS. encoding/json replaces it,
// so recover string code units from the validated token instead.
func parseStringUnits(raw []byte) (any, error) {
	units := jsUnits{}
	for i := 1; i < len(raw)-1; {
		if raw[i] == '\\' {
			i++
			switch raw[i] {
			case 'u':
				n, e := strconv.ParseUint(string(raw[i+1:i+5]), 16, 16)
				if e != nil {
					return nil, e
				}
				units = append(units, uint16(n))
				i += 5
				continue
			case 'b':
				units = append(units, '\b')
			case 'f':
				units = append(units, '\f')
			case 'n':
				units = append(units, '\n')
			case 'r':
				units = append(units, '\r')
			case 't':
				units = append(units, '\t')
			default:
				units = append(units, uint16(raw[i]))
			}
			i++
			continue
		}
		r, n := utf8.DecodeRune(raw[i:])
		units = append(units, utf16.Encode([]rune{r})...)
		i += n
	}
	for i := 0; i < len(units); i++ {
		u := units[i]
		if u >= 0xd800 && u <= 0xdbff && i+1 < len(units) && units[i+1] >= 0xdc00 && units[i+1] <= 0xdfff {
			i++
			continue
		}
		if u >= 0xd800 && u <= 0xdfff {
			return units, nil
		}
	}
	return string(utf16.Decode(units)), nil
}

func EncodeJSON(value any) ([]byte, error) {
	var b bytes.Buffer
	if err := writeJSON(&b, value); err != nil {
		return nil, err
	}
	return b.Bytes(), nil
}
func writeJSON(b *bytes.Buffer, value any) error {
	switch v := value.(type) {
	case nil:
		b.WriteString("null")
	case string:
		quoteUnits(b, utf16.Encode([]rune(v)))
	case jsUnits:
		quoteUnits(b, v)
	case bool:
		if v {
			b.WriteString("true")
		} else {
			b.WriteString("false")
		}
	case float64:
		b.WriteString(jsNumber(v))
	case float32:
		b.WriteString(jsNumber(float64(v)))
	case int:
		b.WriteString(jsNumber(float64(v)))
	case int32:
		b.WriteString(jsNumber(float64(v)))
	case int64:
		b.WriteString(jsNumber(float64(v)))
	case uint32:
		b.WriteString(jsNumber(float64(v)))
	case uint64:
		b.WriteString(jsNumber(float64(v)))
	case json.Number:
		n, e := v.Float64()
		if e != nil {
			return e
		}
		b.WriteString(jsNumber(n))
	case Object:
		b.WriteByte('{')
		for i, f := range orderedFields(v) {
			if i > 0 {
				b.WriteByte(',')
			}
			quoteUnits(b, utf16.Encode([]rune(f.Name)))
			b.WriteByte(':')
			if e := writeJSON(b, f.Value); e != nil {
				return e
			}
		}
		b.WriteByte('}')
	case []any:
		b.WriteByte('[')
		for i, x := range v {
			if i > 0 {
				b.WriteByte(',')
			}
			if e := writeJSON(b, x); e != nil {
				return e
			}
		}
		b.WriteByte(']')
	case []string:
		values := make([]any, len(v))
		for i, s := range v {
			values[i] = s
		}
		return writeJSON(b, values)
	case json.RawMessage:
		x, e := ParseJSON(v)
		if e != nil {
			return e
		}
		return writeJSON(b, x)
	default:
		return fmt.Errorf("unsupported ordered JSON value %T", value)
	}
	return nil
}
func orderedFields(input Object) Object {
	o := Object{}
	for _, f := range input {
		o.Set(f.Name, f.Value)
	}
	sort.SliceStable(o, func(i, j int) bool {
		a, ai := arrayIndex(o[i].Name)
		b, bi := arrayIndex(o[j].Name)
		if ai != bi {
			return ai
		}
		return ai && a < b
	})
	return o
}
func arrayIndex(s string) (uint64, bool) {
	n, e := strconv.ParseUint(s, 10, 32)
	return n, e == nil && n < math.MaxUint32 && strconv.FormatUint(n, 10) == s
}
func quoteUnits(b *bytes.Buffer, u []uint16) {
	b.WriteByte('"')
	for i := 0; i < len(u); i++ {
		c := u[i]
		switch c {
		case '"', '\\':
			b.WriteByte('\\')
			b.WriteByte(byte(c))
		case '\b':
			b.WriteString(`\b`)
		case '\f':
			b.WriteString(`\f`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		default:
			if c < 32 {
				fmt.Fprintf(b, `\u%04x`, c)
			} else if c >= 0xd800 && c <= 0xdbff && i+1 < len(u) && u[i+1] >= 0xdc00 && u[i+1] <= 0xdfff {
				b.WriteRune(utf16.DecodeRune(rune(c), rune(u[i+1])))
				i++
			} else if c >= 0xd800 && c <= 0xdfff {
				fmt.Fprintf(b, `\u%04x`, c)
			} else {
				b.WriteRune(rune(c))
			}
		}
	}
	b.WriteByte('"')
}
func jsNumber(n float64) string {
	if math.IsNaN(n) || math.IsInf(n, 0) {
		return "null"
	}
	if n == 0 {
		return "0"
	}
	abs := math.Abs(n)
	if abs >= 1e-6 && abs < 1e21 {
		return strconv.FormatFloat(n, 'f', -1, 64)
	}
	s := strconv.FormatFloat(n, 'e', -1, 64)
	parts := strings.Split(s, "e")
	exp, _ := strconv.Atoi(parts[1])
	sign := ""
	if exp >= 0 {
		sign = "+"
	}
	return parts[0] + "e" + sign + strconv.Itoa(exp)
}
func jsText(value any) string {
	switch v := value.(type) {
	case nil:
		return "null"
	case string:
		return v
	case jsUnits:
		return string(utf16.Decode(v))
	case bool:
		return strconv.FormatBool(v)
	case float64:
		return jsNumber(v)
	case int:
		return strconv.Itoa(v)
	case int64:
		return strconv.FormatInt(v, 10)
	case uint32:
		return strconv.FormatUint(uint64(v), 10)
	case Object:
		return "[object Object]"
	case []any:
		parts := make([]string, len(v))
		for i, x := range v {
			if x != nil {
				parts[i] = jsText(x)
			}
		}
		return strings.Join(parts, ",")
	default:
		return fmt.Sprint(v)
	}
}
func fallback(o Object, key string, value any) any {
	if v := o.Get(key); v != nil {
		return v
	}
	return value
}
func number(value any) float64 {
	switch v := value.(type) {
	case float64:
		return v
	case int:
		return float64(v)
	case int64:
		return float64(v)
	case uint32:
		return float64(v)
	case nil:
		return 0
	case bool:
		if v {
			return 1
		}
		return 0
	default:
		n, _ := strconv.ParseFloat(jsText(v), 64)
		return n
	}
}

type BodyKind string

const (
	BodyEmpty  BodyKind = ""
	BodyObject BodyKind = "object"
	BodyString BodyKind = "string"
)

type Body struct {
	Bytes []byte
	Kind  BodyKind
}

func JSONBody(value any) (Body, error) {
	if value == nil {
		return Body{}, nil
	}
	switch value.(type) {
	case Object, []any, []string:
	default:
		return Body{}, fmt.Errorf("JSON request body must be an ordered object or array")
	}
	data, e := EncodeJSON(value)
	return Body{data, BodyObject}, e
}
func RawJSONBody(data []byte) (Body, error) {
	v, e := ParseJSON(data)
	if e != nil {
		return Body{}, e
	}
	return JSONBody(v)
}
func TextBody(value string) Body {
	if value == "" {
		return Body{}
	}
	return Body{[]byte(value), BodyString}
}
