package xhsapi

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"testing"
)

func TestVideoPageRedirectRetainsAccessAndCookie(t *testing.T) {
	m := &mockTransport{reply: func(r HTTPRequest) HTTPResponse {
		u, _ := url.Parse(r.URL)
		switch u.Path {
		case "/explore/" + testID:
			return HTTPResponse{StatusCode: 302, Headers: http.Header{"Location": []string{"/next"}}, Body: []byte("redirect"), URL: r.URL}
		case "/next":
			return HTTPResponse{StatusCode: 302, Headers: http.Header{"Location": []string{"/final"}}, Body: []byte("redirect"), URL: r.URL}
		default:
			return HTTPResponse{StatusCode: 200, Body: []byte(`<meta name="og:video" content="https://cdn.test/video.mp4">`), URL: r.URL}
		}
	}}
	c := testClient(t, m, nil)
	address, _, err := c.GetVideoURL(context.Background(), "https://www.xiaohongshu.com/explore/"+testID+"?xsec_token=a%2Bb&xsec_source=pc_user")
	if err != nil || address != "https://cdn.test/video.mp4" || len(m.requests) != 3 {
		t.Fatal("redirect chain failed", err)
	}
	for _, request := range m.requests {
		u, _ := url.Parse(request.URL)
		if u.Query().Get("xsec_token") != "a+b" || u.Query().Get("xsec_source") != "pc_user" || !strings.Contains(header(request, "cookie"), "web_session=synthetic-invalid") {
			t.Fatal("access metadata lost on redirect")
		}
	}
}

func TestVideoPageRejectsErrorAndExternalRedirects(t *testing.T) {
	for _, location := range []string{"https://unrelated.test/page", "/404/sec_code?error_code=300031&error_msg=unavailable"} {
		m := &mockTransport{reply: func(r HTTPRequest) HTTPResponse {
			return HTTPResponse{StatusCode: 302, Headers: http.Header{"Location": []string{location}}, Body: []byte("redirect"), URL: r.URL}
		}}
		c := testClient(t, m, nil)
		_, response, err := c.GetVideoURL(context.Background(), testID)
		if err == nil || response == nil || len(m.requests) != 1 {
			t.Fatal("invalid redirect was followed")
		}
	}
}
