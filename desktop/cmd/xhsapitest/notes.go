package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/cry5tallize/xhs_spider_desktop/internal/xhsapi"
)

func decodeNoteFile(raw []byte) ([]xhsapi.Note, error) {
	value := bytes.TrimSpace(bytes.TrimPrefix(raw, []byte{0xef, 0xbb, 0xbf}))
	if len(value) > 0 && value[0] == '[' {
		return xhsapi.ParseNoteItems(value)
	}
	var envelope map[string]json.RawMessage
	if err := json.Unmarshal(value, &envelope); err != nil {
		return nil, fmt.Errorf("note file: %w", err)
	}
	data := json.RawMessage(value)
	if payload, ok := envelope["data"]; ok {
		data = payload
	}
	return (&xhsapi.Response{Data: data}).DecodeNotes()
}

func writePrettyNotes(filename string, notes []xhsapi.Note) error {
	data, err := json.MarshalIndent(notes, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filename, append(data, '\n'), 0600)
}

func runOfflineNotes(filename, output string) error {
	raw, err := os.ReadFile(filename)
	if err != nil {
		return err
	}
	notes, parseError := decodeNoteFile(raw)
	if notes == nil && parseError != nil {
		return parseError
	}
	recorder, err := newRecorder(output)
	if err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(recorder.directory, "notes.raw.json"), raw, 0600); err != nil {
		return err
	}
	if err := writePrettyNotes(filepath.Join(recorder.directory, "notes.pretty.json"), notes); err != nil {
		return err
	}
	fmt.Println("responses:", recorder.directory)
	for i, note := range notes {
		streams, motionStreams, livePhotos := 0, 0, 0
		if note.Video != nil {
			streams = len(note.Video.Streams)
		}
		for _, image := range note.Images {
			motionStreams += len(image.MotionStreams)
			if image.LivePhoto != nil && *image.LivePhoto {
				livePhotos++
			}
		}
		fmt.Printf("  note[%d]: type=%s images=%d video_streams=%d live_photos=%d motion_streams=%d\n", i, note.Type, len(note.Images), streams, livePhotos, motionStreams)
	}
	if parseError != nil {
		writeError := os.WriteFile(filepath.Join(recorder.directory, "notes.errors.txt"), []byte(parseError.Error()+"\n"), 0600)
		return errors.Join(parseError, writeError)
	}
	return nil
}
