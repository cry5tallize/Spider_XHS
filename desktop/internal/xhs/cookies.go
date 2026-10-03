package xhs

import (
	"fmt"
	"net/url"
	"sort"
	"strings"
)

type CookieUpdate struct {
	Name, Value string
	Delete      bool
}
type cookieKey struct{ host, name string }
type CookieStore struct {
	shared Object
	hosts  map[string]Object
	order  map[cookieKey]int
	next   int
}

func NewCookieStore(header, sourceURL string) (*CookieStore, error) {
	host, e := cookieHost(sourceURL)
	if e != nil {
		return nil, e
	}
	store := &CookieStore{hosts: map[string]Object{}, order: map[cookieKey]int{}}
	for _, f := range ParseCookie(header) {
		store.update(host, []CookieUpdate{{Name: f.Name, Value: jsText(f.Value)}})
	}
	return store, nil
}
func cookieHost(value string) (string, error) {
	u, e := url.Parse(value)
	if e != nil || u.Hostname() == "" {
		return "", fmt.Errorf("Cookie source URL must contain a host")
	}
	return strings.ToLower(u.Hostname()), nil
}
func (s *CookieStore) remember(key cookieKey) {
	if _, ok := s.order[key]; !ok {
		s.order[key] = s.next
		s.next++
	}
}
func (s *CookieStore) update(host string, updates []CookieUpdate) {
	for _, u := range updates {
		key := cookieKey{name: u.Name}
		target := s.shared
		if u.Name == "acw_tc" {
			key.host = host
			target = s.hosts[host]
		}
		if u.Delete {
			out := Object{}
			for _, f := range target {
				if f.Name != u.Name {
					out = append(out, f)
				}
			}
			target = out
			delete(s.order, key)
		} else {
			s.remember(key)
			target.Set(u.Name, u.Value)
		}
		if key.host != "" {
			s.hosts[host] = target
		} else {
			s.shared = target
		}
	}
}
func (s *CookieStore) ForURL(value string) (Object, error) {
	host, e := cookieHost(value)
	if e != nil {
		return nil, e
	}
	combined := append(Object{}, s.shared...)
	combined = append(combined, s.hosts[host]...)
	sort.SliceStable(combined, func(i, j int) bool {
		key := func(f Field) cookieKey {
			k := cookieKey{name: f.Name}
			if f.Name == "acw_tc" {
				k.host = host
			}
			return k
		}
		return s.order[key(combined[i])] < s.order[key(combined[j])]
	})
	return combined, nil
}
func CookieHeader(o Object) string {
	parts := make([]string, 0, len(o))
	for _, f := range o {
		parts = append(parts, f.Name+"="+jsText(f.Value))
	}
	return strings.Join(parts, "; ")
}
func signingCookie(o Object) string {
	hidden := map[string]bool{"acw_tc": true, "web_session": true, "secure_session": true, "id_token": true, "customer-sso-sid": true, "access-token-creator.xiaohongshu.com": true, "galaxy_creator_session_id": true}
	visible := Object{}
	for _, f := range o {
		if !hidden[f.Name] {
			visible = append(visible, f)
		}
	}
	return CookieHeader(visible)
}
func cloneObject(o Object) Object {
	out := make(Object, len(o))
	for i, f := range o {
		out[i] = Field{f.Name, cloneValue(f.Value)}
	}
	return out
}
func cloneValue(v any) any {
	switch x := v.(type) {
	case Object:
		return cloneObject(x)
	case []any:
		a := make([]any, len(x))
		for i, v := range x {
			a[i] = cloneValue(v)
		}
		return a
	case jsUnits:
		return append(jsUnits(nil), x...)
	default:
		return v
	}
}
