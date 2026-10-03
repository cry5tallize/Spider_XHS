package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/cry5tallize/xhs_spider_desktop/internal/xhsapi"
)

func TestMissingNoteLinksAreSkipped(t *testing.T) {
	app := &testApp{}
	err := app.noteCases(context.Background(), func(xhsapi.NoteRef, string) error { t.Fatal("empty link should not run"); return nil })
	if !errors.Is(err, errSkipped) {
		t.Fatal("missing links were counted as successful tests")
	}
}

func TestRecorderPreservesRawResponseAndOmitsCookie(t *testing.T) {
	r, e := newRecorder(t.TempDir())
	if e != nil {
		t.Fatal(e)
	}
	r.setCase("note")
	raw := []byte(" {\n  \"success\": false, \"code\": -1\n}\n")
	if e = r.capture(&xhsapi.Response{Raw: raw, StatusCode: 406, Method: "POST", Path: "/api/sns/web/v1/feed", Endpoint: xhsapi.API, Headers: http.Header{"Set-Cookie": []string{"web_session=private-cookie"}}}); e != nil {
		t.Fatal(e)
	}
	files, e := os.ReadDir(r.directory)
	if e != nil {
		t.Fatal(e)
	}
	if len(files) != 2 {
		t.Fatal("expected raw and metadata files")
	}
	for _, file := range files {
		data, e := os.ReadFile(filepath.Join(r.directory, file.Name()))
		if e != nil {
			t.Fatal(e)
		}
		if filepath.Ext(file.Name()) != ".json" || !json.Valid(data) {
			t.Fatal("saved output is not JSON")
		}
		if bytes.Contains(data, []byte("private-cookie")) {
			t.Fatal("credential header persisted")
		}
		if !bytes.Contains([]byte(file.Name()), []byte(".meta.json")) && !bytes.Equal(data, raw) {
			t.Fatal("raw JSON was reformatted")
		}
	}
}
func TestRecorderSavesNonJSONErrorBody(t *testing.T) {
	r, e := newRecorder(t.TempDir())
	if e != nil {
		t.Fatal(e)
	}
	if e = r.capture(&xhsapi.Response{Raw: []byte("<html>error</html>"), StatusCode: 403, Path: "/api/test"}); e != nil {
		t.Fatal(e)
	}
	files, _ := os.ReadDir(r.directory)
	hasBody := false
	for _, f := range files {
		if filepath.Ext(f.Name()) == ".txt" {
			hasBody = true
		}
	}
	if !hasBody {
		t.Fatal("non-JSON error body lost")
	}
}

func TestRecorderSavesDerivedVideoSeparately(t *testing.T) {
	r, err := newRecorder(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	r.setCase("note")
	video := xhsapi.VideoPlayback{NoteID: "aaaaaaaaaaaaaaaaaaaaaaaa", URL: "https://cdn.test/video.mp4", Source: "og:video", Page: &xhsapi.Response{Raw: []byte("private raw page")}}
	if err = r.captureVideo(video); err != nil {
		t.Fatal(err)
	}
	files, err := os.ReadDir(r.directory)
	if err != nil || len(files) != 1 {
		t.Fatal("missing derived JSON", err)
	}
	data, err := os.ReadFile(filepath.Join(r.directory, files[0].Name()))
	if err != nil || !json.Valid(data) || bytes.Contains(data, []byte("private raw page")) || !bytes.Contains(data, []byte("https://cdn.test/video.mp4")) {
		t.Fatal("incorrect derived JSON", err)
	}
	if r.rawResponses != 0 {
		t.Fatal("derived video counted as a raw HTTP response")
	}
}
