package xhsapi

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
)

// A reader decodes fields separately, so one incompatible optional field does
// not discard an entire note, image, or stream. Every error includes its path.
type noteFields struct {
	values  map[string]json.RawMessage
	used    map[string]bool
	invalid map[string]json.RawMessage
	path    string
	errs    *[]error
}

func newNoteFields(raw json.RawMessage, path string, errs *[]error) *noteFields {
	d := &noteFields{path: path, errs: errs}
	if absentJSON(raw) {
		return d
	}
	if err := json.Unmarshal(raw, &d.values); err != nil {
		d.fail("", fmt.Errorf("expected object: %w", err))
		d.values = map[string]json.RawMessage{}
	}
	return d
}

func absentJSON(raw json.RawMessage) bool {
	v := bytes.TrimSpace(raw)
	return len(v) == 0 || bytes.Equal(v, []byte("null"))
}

func copyNoteRaw(raw json.RawMessage) json.RawMessage {
	return append(json.RawMessage(nil), raw...)
}

func (d *noteFields) fail(name string, err error) {
	field := name
	if index := strings.IndexAny(field, "[."); index >= 0 {
		field = field[:index]
	}
	if raw, ok := d.values[field]; ok {
		if d.invalid == nil {
			d.invalid = map[string]json.RawMessage{}
		}
		d.invalid[field] = copyNoteRaw(raw)
	}
	path := d.path
	if name != "" {
		path += "." + name
	}
	*d.errs = append(*d.errs, fmt.Errorf("%s: %w", path, err))
}

func (d *noteFields) raw(name string) json.RawMessage {
	raw, exists := d.values[name]
	if exists {
		if d.used == nil {
			d.used = make(map[string]bool, len(d.values))
		}
		d.used[name] = true
	}
	// json.Unmarshal already gives each RawMessage its own storage; reading a
	// scalar does not need another copy, or a used entry for a missing field.
	return raw
}

func (d *noteFields) extra() map[string]json.RawMessage {
	out := mergeNoteExtra(nil, d.invalid)
	for name, raw := range d.values {
		if !d.used[name] {
			if out == nil {
				out = map[string]json.RawMessage{}
			}
			out[name] = copyNoteRaw(raw)
		}
	}
	return out
}

func noteScalarText(raw json.RawMessage) (string, error) {
	if absentJSON(raw) {
		return "", nil
	}
	v := bytes.TrimSpace(raw)
	if v[0] == '"' {
		var s string
		err := json.Unmarshal(v, &s)
		return s, err
	}
	// These field slices come from validated JSON. Retain number spelling,
	// especially large IDs, without another Unmarshal or a float conversion.
	if v[0] == '-' || (v[0] >= '0' && v[0] <= '9') {
		return string(v), nil
	}
	return "", fmt.Errorf("expected string or number")
}

func (d *noteFields) text(name string) string {
	s, err := noteScalarText(d.raw(name))
	if err != nil {
		d.fail(name, err)
	}
	return s
}

func (d *noteFields) integer(name string) *int64 {
	s, err := noteScalarText(d.raw(name))
	if err == nil && s == "" {
		return nil
	}
	var n int64
	if err == nil {
		n, err = strconv.ParseInt(s, 10, 64)
	}
	if err != nil {
		d.fail(name, err)
		return nil
	}
	return &n
}

func (d *noteFields) number(name string) *float64 {
	s, err := noteScalarText(d.raw(name))
	if err == nil && s == "" {
		return nil
	}
	var n float64
	if err == nil {
		n, err = strconv.ParseFloat(s, 64)
		if err == nil && (math.IsInf(n, 0) || math.IsNaN(n)) {
			err = fmt.Errorf("expected finite number")
		}
	}
	if err != nil {
		d.fail(name, err)
		return nil
	}
	return &n
}

func (d *noteFields) boolean(name string) *bool {
	raw := d.raw(name)
	if absentJSON(raw) {
		return nil
	}
	var b bool
	if json.Unmarshal(raw, &b) == nil {
		return &b
	}
	s, err := noteScalarText(raw)
	if err == nil && s == "" {
		return nil
	}
	if err == nil {
		b, err = strconv.ParseBool(s)
	}
	if err != nil {
		d.fail(name, fmt.Errorf("expected boolean: %w", err))
		return nil
	}
	return &b
}

func (d *noteFields) array(name string) []json.RawMessage {
	raw := d.raw(name)
	if absentJSON(raw) {
		return nil
	}
	var out []json.RawMessage
	if err := json.Unmarshal(raw, &out); err != nil {
		d.fail(name, fmt.Errorf("expected array: %w", err))
	}
	return out
}

func (d *noteFields) strings(name string) []string {
	out := []string{}
	for i, raw := range d.array(name) {
		s, err := noteScalarText(raw)
		if err != nil {
			d.fail(fmt.Sprintf("%s[%d]", name, i), err)
			continue
		}
		out = append(out, s)
	}
	return out
}
