package xhs

import (
	"bytes"
	"encoding/json"
	"os"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"
)

const fixtureNow int64 = 1791000000000

func fixtureCookie(gid bool) string {
	cookie := "a1=" + strings.Repeat("0", 52) + "; web_session=synthetic-invalid; loadts=1790999997849; webBuild=6.47.2"
	if gid {
		cookie += "; gid=synthetic"
	}
	return cookie
}
func fixtureSession(t *testing.T, gid bool) *Session {
	t.Helper()
	s, e := NewSession(fixtureCookie(gid), SessionOptions{Clock: func() time.Time { return time.UnixMilli(fixtureNow) }, UserID: "test-user"})
	if e != nil {
		t.Fatal(e)
	}
	return s
}
func TestCookieHostIsolationAndOrder(t *testing.T) {
	s, e := NewCookieStore("a1=a; acw_tc=edge-one; value=a=b; web_session=s", "https://edith.xiaohongshu.com/")
	if e != nil {
		t.Fatal(e)
	}
	api, _ := s.ForURL(APIOrigin)
	search, _ := s.ForURL(SearchOrigin)
	if CookieHeader(api) != "a1=a; acw_tc=edge-one; value=a=b; web_session=s" {
		t.Fatal("original order lost")
	}
	if CookieHeader(search) != "a1=a; value=a=b; web_session=s" {
		t.Fatal("host Cookie leaked")
	}
	s.update("so.xiaohongshu.com", []CookieUpdate{{Name: "acw_tc", Value: "edge-two"}, {Name: "acw_tc", Value: "edge-three"}})
	search, _ = s.ForURL(SearchOrigin)
	if search.Get("acw_tc") != "edge-three" {
		t.Fatal("last host update was lost")
	}
	api, _ = s.ForURL(APIOrigin)
	if api.Get("acw_tc") != "edge-one" {
		t.Fatal("other host changed")
	}
	s.update("edith.xiaohongshu.com", []CookieUpdate{{Name: "value", Delete: true}})
	api, _ = s.ForURL(APIOrigin)
	if api.Has("value") {
		t.Fatal("deleted Cookie retained")
	}
	if strings.Contains(signingCookie(api), "web_session") || strings.Contains(signingCookie(api), "acw_tc") {
		t.Fatal("hidden Cookie in signing view")
	}
}
func TestSessionTemplateAndTier(t *testing.T) {
	s := fixtureSession(t, true)
	b1, e := s.CurrentB1(fixtureNow)
	if e != nil {
		t.Fatal(e)
	}
	if b1 != loadReference(t).B1[2].B1 {
		t.Fatal("PC B1 options differ from Node reference")
	}
	for _, c := range []struct {
		gid       bool
		api, want string
	}{{true, "/api/test", "0301"}, {false, "/api/test", "0101"}, {false, "/api/sec/v1/test", "0201"}} {
		session := fixtureSession(t, c.gid)
		tier, e := session.ResolveTier(c.api, "")
		if e != nil || tier != c.want {
			t.Fatalf("tier: %s %v", tier, e)
		}
	}
	if e = s.MergeCookies(APIOrigin, []CookieUpdate{{Name: "webBuild", Value: "6.32.2"}}); e != nil {
		t.Fatal(e)
	}
	if s.release.Get("signVersion") != "4.3.7" {
		t.Fatal("historical release ignored")
	}
}
func TestSessionConcurrentSequences(t *testing.T) {
	s := fixtureSession(t, true)
	version := uint32(123)
	var wg sync.WaitGroup
	values := make(chan uint32, 100)
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			p, _, e := s.NextContext("/api/test", "", &version)
			if e != nil {
				t.Error(e)
				return
			}
			values <- p.Sequence
		}()
	}
	wg.Wait()
	close(values)
	seen := map[uint32]bool{}
	for v := range values {
		if seen[v] {
			t.Fatal("sequence reused")
		}
		seen[v] = true
	}
	if len(seen) != 100 || s.Snapshot().Sequence != 100 {
		t.Fatal("sequence count mismatch")
	}
}
func TestPrepareReference(t *testing.T) {
	s := fixtureSession(t, true)
	ref := loadReference(t)
	c := ref.Signs[8]
	o := parseObject(t, c.Input)
	body, e := JSONBody(o.Get("data"))
	if e != nil {
		t.Fatal(e)
	}
	version := uint32(123)
	elapsed := uint32(3)
	mask := byte(51)
	input := RAPInput{Mask: &mask, XORKey: []byte("abcdefghijklmnop"), Nonce: []byte("0123"), BodyEncryptTime: &elapsed}
	request, e := s.Prepare("POST", APIOrigin, "/api/sns/web/v1/feed", body, "1790999998000", RequestOptions{Version: &version, XT: fixtureNow + 1, TraceID: strings.Repeat("a", 16), XrayTraceID: strings.Repeat("b", 32), RAP: &input})
	if e != nil {
		t.Fatal(e)
	}
	var want Signature
	if e = json.Unmarshal(c.Expected, &want); e != nil {
		t.Fatal(e)
	}
	if !reflect.DeepEqual(request.Signature, want) {
		t.Fatal("state → signature differs from Node reference")
	}
	if request.Headers.Get("xy-direction") == "" || request.Headers.Get("x-rap-param") == "" {
		t.Fatal("feed route headers missing")
	}
	body.Bytes[0] = '!'
	if request.Body[0] != '{' {
		t.Fatal("request shares caller's body buffer")
	}
	var manifest struct {
		HeaderOrders map[string][]string `json:"headerOrders"`
	}
	fixture, e := os.ReadFile("testdata/reference.json")
	if e != nil {
		t.Fatal(e)
	}
	if e = json.Unmarshal(fixture, &manifest); e != nil {
		t.Fatal(e)
	}
	names := []string{}
	for _, h := range request.Headers {
		names = append(names, h.Name)
	}
	if !reflect.DeepEqual(names, manifest.HeaderOrders["PC_XY_RAP_POST_HEADER_ORDER"]) {
		t.Fatalf("header contract differs: %v", names)
	}
	if _, e = s.Prepare("GET", APIOrigin, "/api/test", Body{[]byte("{}"), BodyObject}, "anchor", RequestOptions{}); e == nil {
		t.Fatal("GET body accepted")
	}
}
func TestSessionRequiresCredential(t *testing.T) {
	for _, cookie := range []string{"", "a1=a", "web_session=s"} {
		if _, e := NewSession(cookie, SessionOptions{}); e == nil {
			t.Fatal("missing credential accepted")
		}
	}
}

func TestPreparePreservesPCSignerGate(t *testing.T) {
	s, e := NewSession("a1=short; web_session=synthetic-invalid; gid=synthetic", SessionOptions{Clock: func() time.Time { return time.UnixMilli(fixtureNow) }})
	if e != nil {
		t.Fatal(e)
	}
	if _, e = s.Prepare("GET", APIOrigin, "/api/test", Body{}, "1790999998000", RequestOptions{}); e == nil {
		t.Fatal("PC adapter accepted a layout rejected by the original signer gate")
	}
}
func TestIdentifiersAndOrderedQuery(t *testing.T) {
	for text, want := range map[string]uint32{"": 0, "foo": 0xf6a5c420, "hello": 0x248bfa47} {
		if got := MurmurHash3(text, 0); got != want {
			t.Fatalf("murmur %q: %x", text, got)
		}
	}
	got, e := GenerateSearchID(1, 0.0, "")
	if e != nil || got != "3w5e11264sgsg" {
		t.Fatalf("search wide integer %s %v", got, e)
	}
	uuid, e := GenerateUUID(bytes.NewReader(make([]byte, 16)))
	if e != nil || uuid != "00000000-0000-4000-8000-000000000000" {
		t.Fatalf("UUID %s %v", uuid, e)
	}
	query, e := SpliceQuery("/api/test", Object{{"z", "a b+c"}, {"a", "\u6d4b\u8bd5"}, {"empty", nil}, {"repeat", []any{"one", "two"}}})
	if e != nil || query != "/api/test?z=a+b%2Bc&a=%E6%B5%8B%E8%AF%95&empty=&repeat=one&repeat=two" {
		t.Fatalf("query %s %v", query, e)
	}
}
