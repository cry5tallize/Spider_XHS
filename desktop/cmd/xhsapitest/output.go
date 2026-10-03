package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sync"
	"time"

	"github.com/cry5tallize/xhs_spider_desktop/internal/xhsapi"
)

var unsafeFilename = regexp.MustCompile(`[^a-zA-Z0-9_-]+`)

type recorder struct {
	directory, caseName string
	sequence            int
	rawResponses        int
	mu                  sync.Mutex
}

func newRecorder(output string) (*recorder, error) {
	dir := filepath.Join(output, time.Now().Format("20060102-150405.000000000"))
	if e := os.MkdirAll(dir, 0700); e != nil {
		return nil, e
	}
	return &recorder{directory: dir, caseName: "bootstrap"}, nil
}
func (r *recorder) setCase(name string) { r.mu.Lock(); defer r.mu.Unlock(); r.caseName = name }
func (r *recorder) capture(response *xhsapi.Response) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.sequence++
	r.rawResponses++
	base := fmt.Sprintf("%04d_%s_%s", r.sequence, unsafeFilename.ReplaceAllString(r.caseName, "_"), unsafeFilename.ReplaceAllString(response.Path, "_"))
	valid := json.Valid(response.Raw)
	suffix := ".json"
	if !valid {
		suffix = ".body.txt"
	}
	filename := base + suffix
	if e := os.WriteFile(filepath.Join(r.directory, filename), response.Raw, 0600); e != nil {
		return e
	}
	metadata := struct {
		At, Case, Endpoint, Method, Path string
		StatusCode                       int
		DurationMS                       int64
		ContentType, RequestID, RawFile  string
		ValidJSON                        bool
	}{time.Now().Format(time.RFC3339Nano), r.caseName, string(response.Endpoint), response.Method, response.Path, response.StatusCode, response.Duration.Milliseconds(), response.Headers.Get("Content-Type"), response.Headers.Get("X-Request-ID"), filename, valid}
	data, e := json.MarshalIndent(metadata, "", "  ")
	if e != nil {
		return e
	}
	return os.WriteFile(filepath.Join(r.directory, base+".meta.json"), append(data, '\n'), 0600)
}

func (r *recorder) captureVideo(video xhsapi.VideoPlayback) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.sequence++
	filename := fmt.Sprintf("%04d_%s_%s.video.json", r.sequence, unsafeFilename.ReplaceAllString(r.caseName, "_"), unsafeFilename.ReplaceAllString(video.NoteID, "_"))
	data, err := json.MarshalIndent(video, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(r.directory, filename), append(data, '\n'), 0600)
}
