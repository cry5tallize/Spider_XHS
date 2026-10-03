package xhsapi

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"testing"
)

func TestNoteDetailVideoRequestsPublicPage(t *testing.T) {
	feed := []byte(`{"success":true,"data":{"items":[{"id":"` + testID + `","note_card":{"note_id":"` + testID + `","type":"video"}}]}}`)
	m := &mockTransport{reply: func(r HTTPRequest) HTTPResponse {
		body := []byte(`{"success":true,"data":{"user_id":"` + testID + `"}}`)
		if strings.HasSuffix(r.URL, "/api/sns/web/v1/feed") {
			body = feed
		}
		if strings.Contains(r.URL, "/explore/") {
			body = []byte(`<meta name="og:video" content="https://cdn.test/video.mp4?a=1&amp;b=2">`)
		}
		return HTTPResponse{StatusCode: 200, Headers: http.Header{}, Body: body, URL: r.URL}
	}}
	c := testClient(t, m, nil)
	detail, err := c.GetNoteDetail(context.Background(), "https://www.xiaohongshu.com/explore/"+testID+"?xsec_token=token%2Bvalue&xsec_source=pc_user")
	if err != nil {
		t.Fatal(err)
	}
	if len(m.requests) != 3 || !strings.HasPrefix(m.requests[2].URL, "https://web.example.test/explore/"+testID+"?") {
		t.Fatal("missing feed -> video page chain")
	}
	pageURL, parseErr := url.Parse(m.requests[2].URL)
	if parseErr != nil || pageURL.Query().Get("xsec_token") != "token+value" || pageURL.Query().Get("xsec_source") != "pc_user" {
		t.Fatal("page access parameters lost", parseErr)
	}
	if !strings.Contains(header(m.requests[2], "cookie"), "web_session=synthetic-invalid") || header(m.requests[2], "x-s") != "" {
		t.Fatal("page must carry Cookie without API signing headers")
	}
	if len(detail.Videos) != 1 || detail.Videos[0].URL != "https://cdn.test/video.mp4?a=1&b=2" || detail.Videos[0].Source != "og:video" {
		t.Fatal("playback URL not attached")
	}
	if !bytes.Equal(detail.Response.Raw, feed) {
		t.Fatal("feed raw response was modified")
	}
}

func TestNoteDetailNormalDoesNotRequestPage(t *testing.T) {
	m := &mockTransport{reply: func(r HTTPRequest) HTTPResponse {
		body := []byte(`{"success":true,"data":{"user_id":"` + testID + `"}}`)
		if strings.HasSuffix(r.URL, "/api/sns/web/v1/feed") {
			body = []byte(`{"success":true,"data":{"items":[{"id":"` + testID + `","note_card":{"type":"normal"}}]}}`)
		}
		return HTTPResponse{StatusCode: 200, Body: body, URL: r.URL}
	}}
	c := testClient(t, m, nil)
	detail, err := c.GetNoteDetail(context.Background(), testID)
	if err != nil || len(detail.Videos) != 0 || len(m.requests) != 2 {
		t.Fatal("normal note unexpectedly fetched video page", err)
	}
}

func TestNoteDetailRetainsFeedWhenPageHasNoVideo(t *testing.T) {
	feed := []byte(`{"success":true,"data":{"items":[{"id":"` + testID + `","note_card":{"type":"video"}}]}}`)
	m := &mockTransport{reply: func(r HTTPRequest) HTTPResponse {
		body := []byte(`{"success":true,"data":{"user_id":"` + testID + `"}}`)
		if strings.HasSuffix(r.URL, "/api/sns/web/v1/feed") {
			body = feed
		}
		if strings.Contains(r.URL, "/explore/") {
			body = []byte(`<html>verification required</html>`)
		}
		return HTTPResponse{StatusCode: 200, Body: body, URL: r.URL}
	}}
	c := testClient(t, m, nil)
	detail, err := c.GetNoteDetail(context.Background(), testID)
	if err == nil || detail == nil || !bytes.Equal(detail.Response.Raw, feed) || len(detail.Videos) != 1 || detail.Videos[0].Error == "" || detail.Videos[0].Page == nil {
		t.Fatal("page failure lost feed or diagnostics")
	}
	data, marshalErr := json.Marshal(detail.Videos[0])
	if marshalErr != nil || bytes.Contains(data, []byte("verification required")) {
		t.Fatal("derived URL result includes raw page", marshalErr)
	}
}
