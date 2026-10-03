package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/cry5tallize/xhs_spider_desktop/internal/xhsapi"
)

func TestNoteFileAcceptsItemsDataAndResponse(t *testing.T) {
	items := `[{"id":"note","note_card":{"type":"normal","image_list":[{"info_list":[{"image_scene":"WB_PRV","url":"preview"},{"image_scene":"WB_DFT","url":"default"}]}]}}]`
	for _, raw := range []string{items, `{"items":` + items + `}`, `{"success":true,"data":{"items":` + items + `}}`, "\xef\xbb\xbf" + items} {
		notes, err := decodeNoteFile([]byte(raw))
		if err != nil || len(notes) != 1 || notes[0].Images[0].Variants[0].URL != "default" {
			t.Fatal("offline input shape not supported", err)
		}
	}
}

func TestOfflineNotesWritesRawAndPrettyWithoutCookie(t *testing.T) {
	t.Setenv("COOKIE", "")
	t.Setenv("XHS_COOKIE", "")
	dir := t.TempDir()
	input := filepath.Join(dir, "input.json")
	raw := []byte(" [\n {\"id\":\"example\",\"note_card\":{\"type\":\"normal\",\"image_list\":[]}}\n ] \n")
	if err := os.WriteFile(input, raw, 0600); err != nil {
		t.Fatal(err)
	}
	output := filepath.Join(dir, "output")
	if err := runOfflineNotes(input, output); err != nil {
		t.Fatal(err)
	}
	runs, err := os.ReadDir(output)
	if err != nil || len(runs) != 1 {
		t.Fatal("offline output missing", err)
	}
	runDir := filepath.Join(output, runs[0].Name())
	saved, err := os.ReadFile(filepath.Join(runDir, "notes.raw.json"))
	if err != nil || !bytes.Equal(saved, raw) {
		t.Fatal("offline raw file was reformatted", err)
	}
	pretty, err := os.ReadFile(filepath.Join(runDir, "notes.pretty.json"))
	if err != nil || !json.Valid(pretty) || !bytes.Contains(pretty, []byte(`"has_live_photo"`)) {
		t.Fatal("pretty result missing", err)
	}
}

func TestRecorderSavesFeedPrettyAndOriginalBody(t *testing.T) {
	r, err := newRecorder(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	data := []byte(`{"items":[{"id":"note","note_card":{"video":{"media":{"stream":{"EF7":[{"master_url":"first","width":100,"height":200},{"master_url":"best","width":200,"height":400}]}}}}}]}`)
	raw := append([]byte(`{"success":true,"data":`), data...)
	raw = append(raw, '}')
	if err := r.capture(&xhsapi.Response{Raw: raw, Data: data, Path: "/api/sns/web/v1/feed", StatusCode: 200, Headers: http.Header{}}); err != nil {
		t.Fatal(err)
	}
	files, err := os.ReadDir(r.directory)
	if err != nil || len(files) != 3 {
		t.Fatal("expected raw, metadata, and note pretty files", err)
	}
	for _, file := range files {
		body, err := os.ReadFile(filepath.Join(r.directory, file.Name()))
		if err != nil {
			t.Fatal(err)
		}
		if strings.HasSuffix(file.Name(), ".notes.pretty.json") {
			var notes []xhsapi.Note
			if err := json.Unmarshal(body, &notes); err != nil || notes[0].Video.Streams[0].MasterURL != "best" || len(notes[0].Video.Streams) != 2 {
				t.Fatal("feed pretty result incomplete", err)
			}
		} else if !strings.HasSuffix(file.Name(), ".meta.json") && !bytes.Equal(body, raw) {
			t.Fatal("original feed response changed")
		}
	}
}

func TestOfflineNotesWritesPartialResultAndErrors(t *testing.T) {
	dir := t.TempDir()
	input := filepath.Join(dir, "input.json")
	raw := []byte(`[{"note_card":{"title":"usable","image_list":[{"width":"bad","url_default":"usable-image"}]}}]`)
	if err := os.WriteFile(input, raw, 0600); err != nil {
		t.Fatal(err)
	}
	output := filepath.Join(dir, "output")
	if err := runOfflineNotes(input, output); err == nil {
		t.Fatal("partial parse error not reported")
	}
	runs, err := os.ReadDir(output)
	if err != nil || len(runs) != 1 {
		t.Fatal(err)
	}
	runDir := filepath.Join(output, runs[0].Name())
	body, err := os.ReadFile(filepath.Join(runDir, "notes.pretty.json"))
	if err != nil || !bytes.Contains(body, []byte("usable-image")) {
		t.Fatal("partial usable output discarded", err)
	}
	if _, err := os.Stat(filepath.Join(runDir, "notes.errors.txt")); err != nil {
		t.Fatal("field errors not saved", err)
	}
}
