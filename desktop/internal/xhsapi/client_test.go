package xhsapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"
)

const testID = "aaaaaaaaaaaaaaaaaaaaaaaa"

type mockTransport struct {
	requests []HTTPRequest
	reply    func(HTTPRequest) HTTPResponse
	closed   int
}

func (m *mockTransport) Close() error { m.closed++; return nil }
func (m *mockTransport) Do(ctx context.Context, r HTTPRequest) (HTTPResponse, error) {
	if e := ctx.Err(); e != nil {
		return HTTPResponse{}, e
	}
	m.requests = append(m.requests, r)
	if m.reply != nil {
		return m.reply(r), nil
	}
	return HTTPResponse{StatusCode: 200, Headers: http.Header{}, Body: []byte(`{"success":true,"code":0,"data":{"user_id":"` + testID + `"}}`), URL: r.URL}, nil
}
func testClient(t *testing.T, m *mockTransport, observer func(*Response) error) *Client {
	t.Helper()
	c, e := NewClient("a1="+strings.Repeat("0", 52)+"; web_session=synthetic-invalid; gid=synthetic; acw_tc=edge-api", Options{Transport: m, APIOrigin: "https://api.example.test", SearchOrigin: "https://search.example.test", WebOrigin: "https://web.example.test", DSL: "1790999998000", Clock: func() time.Time { return time.UnixMilli(1791000000000) }, OnResponse: observer})
	if e != nil {
		t.Fatal(e)
	}
	return c
}
func header(r HTTPRequest, name string) string {
	for _, h := range r.Headers {
		if h.Name == name {
			return h.Value
		}
	}
	return ""
}

func TestNoteRequestContractAndRawCapture(t *testing.T) {
	m := &mockTransport{}
	captures := []*Response{}
	c := testClient(t, m, func(r *Response) error { captures = append(captures, r); return nil })
	defer c.Close()
	r, e := c.GetNote(context.Background(), "https://www.xiaohongshu.com/explore/"+testID+"?xsec_token=first&xsec_token=a%2Bb&xsec_source=pc_user")
	if e != nil {
		t.Fatal(e)
	}
	if len(m.requests) != 2 || len(captures) != 2 {
		t.Fatal("account bootstrap/capture missing")
	}
	request := m.requests[1]
	want := `{"source_note_id":"` + testID + `","image_formats":["jpg","webp","avif"],"extra":{"need_body_topic":"1"},"xsec_source":"pc_user","xsec_token":"a+b"}`
	if string(request.Body) != want {
		t.Fatalf("feed body changed: %s", request.Body)
	}
	if request.URL != "https://api.example.test/api/sns/web/v1/feed" {
		t.Fatal(request.URL)
	}
	if !strings.HasPrefix(header(request, "x-s"), "XYS_") || !strings.HasPrefix(header(request, "x-rap-param"), "ByQ") || header(request, "xy-direction") == "" {
		t.Fatal("feed headers incomplete")
	}
	if !bytes.Equal(r.Raw, captures[1].Raw) {
		t.Fatal("raw body changed")
	}
	if c.UserID() != testID {
		t.Fatal("account state not updated")
	}
}
func TestSearchContractAndRouting(t *testing.T) {
	m := &mockTransport{}
	c := testClient(t, m, nil)
	ctx := context.Background()
	if _, e := c.SearchNotes(ctx, "测试", SearchNotesOptions{SearchID: "search-fixed", SessionID: "session-fixed", Sort: SortLatest}); e != nil {
		t.Fatal(e)
	}
	r := m.requests[0]
	want := `{"keyword":"测试","page":1,"page_size":20,"search_id":"search-fixed","sort":"time_descending","note_type":0,"ext_flags":[],"geo":"","image_formats":["jpg","webp","avif"],"session_id":"session-fixed"}`
	if r.URL != "https://search.example.test/api/sns/web/v2/search/notes" || string(r.Body) != want {
		t.Fatalf("search contract: %s %s", r.URL, r.Body)
	}
	if strings.Contains(header(r, "cookie"), "acw_tc") {
		t.Fatal("API host Cookie leaked to search")
	}
	if _, e := c.SyncSearchHistoryCaptured(ctx, 123, []any{}); e != nil {
		t.Fatal(e)
	}
	r = m.requests[1]
	if r.URL != "https://search.example.test/api/sns/web/search/history/sync" || string(r.Body) != `{"client_time":123,"ops":[]}` {
		t.Fatal("history route/body changed")
	}
	if _, e := c.GetDQARecommend(ctx, ""); e != nil {
		t.Fatal(e)
	}
	if !strings.HasPrefix(m.requests[2].URL, "https://search.example.test/") {
		t.Fatal("DQA target incorrect")
	}
}
func TestEmptyConfigAndOrderedQueries(t *testing.T) {
	m := &mockTransport{}
	c := testClient(t, m, nil)
	ctx := context.Background()
	if _, e := c.GetWebConfig(ctx); e != nil {
		t.Fatal(e)
	}
	if m.requests[0].Method != "POST" || len(m.requests[0].Body) != 0 || header(m.requests[0], "content-type") != "" {
		t.Fatal("config empty POST changed")
	}
	if _, e := c.GetUserNotes(ctx, testID, UserNotesOptions{Cursor: "a b+c", Token: "x&y", Source: "pc_user"}); e != nil {
		t.Fatal(e)
	}
	want := "https://api.example.test/api/sns/web/v1/user_posted?num=30&cursor=a+b%2Bc&user_id=" + testID + "&image_formats=jpg%2Cwebp%2Cavif&xsec_token=x%26y&xsec_source=pc_user"
	if m.requests[1].URL != want {
		t.Fatalf("query changed: %s", m.requests[1].URL)
	}
	if _, e := c.ReportHistory(ctx, Params{{"events", []any{}}, {"extra_map", Params{}}}); e != nil {
		t.Fatal(e)
	}
	if header(m.requests[2], "content-type") != "application/json" {
		t.Fatal("history media type ignored")
	}
}
func TestErrorResponseIsRetainedAndObserved(t *testing.T) {
	for _, body := range []string{`{"success":false,"code":-1,"msg":"rejected"}`, "<html>rejected</html>"} {
		m := &mockTransport{reply: func(r HTTPRequest) HTTPResponse { return HTTPResponse{StatusCode: 406, Body: []byte(body), URL: r.URL} }}
		observed := false
		c := testClient(t, m, func(r *Response) error { observed = true; return nil })
		r, e := c.GetMe(context.Background())
		if e == nil || r == nil || string(r.Raw) != body || !observed {
			t.Fatal("error reply lost")
		}
	}
	m := &mockTransport{}
	c := testClient(t, m, func(*Response) error { return errors.New("disk full") })
	r, e := c.GetMe(context.Background())
	if r == nil || e == nil || !strings.Contains(e.Error(), "disk full") {
		t.Fatal("capture failure hidden")
	}
}
func TestMediaPageUsesCookieWithoutAPISignature(t *testing.T) {
	m := &mockTransport{reply: func(r HTTPRequest) HTTPResponse {
		return HTTPResponse{StatusCode: 200, Body: []byte(`<html><head><meta property="og:video" content="https://cdn.test/video?a=1&amp;b=2"></head></html>`), URL: r.URL}
	}}
	c := testClient(t, m, nil)
	address, r, e := c.GetVideoURL(context.Background(), testID)
	if e != nil || address != "https://cdn.test/video?a=1&b=2" || r == nil {
		t.Fatal(address, e)
	}
	if len(m.requests) != 1 || !strings.Contains(header(m.requests[0], "cookie"), "web_session=synthetic-invalid") || header(m.requests[0], "x-s") != "" {
		t.Fatal("navigation must carry Cookie without API signature")
	}
	got, e := ImageURL("https://sns-webpic-qc.xhscdn.com/time/hash/notes_pre_post/image!nd_webp?x=1")
	if e != nil || got != "https://ci.xiaohongshu.com/notes_pre_post/image?imageView2/format/jpeg" {
		t.Fatal(got, e)
	}
}
func TestPaginationRetainsLastPageAndPartialError(t *testing.T) {
	responses := []*Response{{Data: json.RawMessage(`{"notes":[{"id":"one"}],"cursor":"next","has_more":true}`)}, {Data: json.RawMessage(`{"notes":[{"id":"two"}],"has_more":false}`)}}
	index := 0
	result, e := collectCursor(context.Background(), CollectOptions{}, func(string) (*Response, error) { r := responses[index]; index++; return r, nil }, "notes", "")
	if e != nil || len(result.Items) != 2 || len(result.Responses) != 2 {
		t.Fatal("final page lost", e)
	}
	index = 0
	result, e = collectCursor(context.Background(), CollectOptions{}, func(string) (*Response, error) {
		index++
		if index == 2 {
			return nil, errors.New("offline")
		}
		return responses[0], nil
	}, "notes", "")
	if e == nil || len(result.Items) != 1 {
		t.Fatal("partial data lost")
	}
	result, e = collectCursor(context.Background(), CollectOptions{}, func(string) (*Response, error) { return responses[0], nil }, "notes", "")
	if !errors.Is(e, ErrRepeatedCursor) || len(result.Items) != 2 {
		t.Fatal("repeated cursor did not terminate", e)
	}
	result, e = collectCursor(context.Background(), CollectOptions{Limit: 1}, func(string) (*Response, error) { return responses[0], nil }, "notes", "")
	if e != nil || len(result.Items) != 1 {
		t.Fatal("item limit ignored")
	}
}
func TestSearchPaginationIDLifecycle(t *testing.T) {
	m := &mockTransport{reply: func(r HTTPRequest) HTTPResponse {
		var body struct {
			Page int `json:"page"`
		}
		_ = json.Unmarshal(r.Body, &body)
		more := "true"
		if body.Page == 2 {
			more = "false"
		}
		return HTTPResponse{StatusCode: 200, Body: []byte(`{"success":true,"data":{"items":[{"id":"one"}],"has_more":` + more + `}}`), URL: r.URL}
	}}
	c := testClient(t, m, nil)
	if _, e := c.CollectSearchNotes(context.Background(), "test", SearchNotesOptions{}, CollectOptions{MaxPages: 3}); e != nil {
		t.Fatal(e)
	}
	var a, b map[string]any
	_ = json.Unmarshal(m.requests[0].Body, &a)
	_ = json.Unmarshal(m.requests[1].Body, &b)
	if a["search_id"] != b["search_id"] || a["session_id"] == b["session_id"] {
		t.Fatal("search identity lifecycle changed")
	}
}
func TestInvalidArgumentsDoNotIssueRequests(t *testing.T) {
	m := &mockTransport{}
	c := testClient(t, m, nil)
	if _, e := c.GetNote(context.Background(), "https://xhslink.com/short"); e == nil {
		t.Fatal("short link accepted")
	}
	if _, e := c.SearchNotes(context.Background(), "", SearchNotesOptions{}); e == nil {
		t.Fatal("empty keyword accepted")
	}
	if _, e := c.GetUserInfo(context.Background(), ""); e == nil {
		t.Fatal("empty user accepted")
	}
	if len(m.requests) != 0 {
		t.Fatal("invalid arguments sent")
	}
	c.Close()
	c.Close()
	if m.closed != 1 {
		t.Fatal("transport closed more than once")
	}
}
func TestEndpointSourceURL(t *testing.T) {
	m := &mockTransport{}
	c := testClient(t, m, nil)
	if _, e := c.GetSearchKeywords(context.Background(), "a b+c"); e != nil {
		t.Fatal(e)
	}
	u, e := url.Parse(m.requests[0].URL)
	if e != nil || u.Query().Get("keyword") != "a b+c" {
		t.Fatal("query encoding")
	}
}
