package xhsapi

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"reflect"
	"strings"
	"testing"
)

func notePointer[T any](value T) *T { return &value }

func noteItemsJSON(t *testing.T, cards ...map[string]any) json.RawMessage {
	t.Helper()
	items := []any{}
	for i, card := range cards {
		items = append(items, map[string]any{"id": fmt.Sprintf("item-%d", i), "model_type": "note", "note_card": card})
	}
	raw, err := json.Marshal(items)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func TestNoteResponseFixture(t *testing.T) {
	raw, err := os.ReadFile("testdata/note_response.json")
	if err != nil {
		t.Fatal(err)
	}
	notes, err := ParseNoteItems(raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(notes) != 3 {
		t.Fatalf("notes: %d", len(notes))
	}
	video := notes[0].Video
	if notes[0].Type != "video" || video == nil || len(video.Streams) != 5 {
		t.Fatal("fixture video streams were lost or duplicated")
	}
	if video.VideoID != "138130672442988094" || len(video.Sources) != 2 || video.Sources[1].VideoID != video.VideoID {
		t.Fatal("large numeric/string video ID lost precision")
	}
	first := video.Streams[0]
	if first.Codec != "h265" || *first.Width != 2160 || *first.Height != 3840 || *first.FPS != 60 {
		t.Fatal("highest-resolution stream is not first")
	}
	if *video.Metadata.DurationSec != 30 || *video.CapaDurationSec != 29 || *first.DurationMS != 29384 {
		t.Fatal("duration units were mixed")
	}
	if len(video.StreamsForCodec("EF4")) != 1 || len(video.StreamsForCodec("h265")) != 4 {
		t.Fatal("codec filtering is incomplete")
	}
	if video.Metadata.Extra["opaque1"] == nil || video.Metadata.Extra["bbox"] == nil || first.Extra["opaque1"] == nil {
		t.Fatal("extended video metadata was discarded")
	}
	for _, stream := range video.Streams {
		if len(stream.Sources) != 2 || len(stream.BackupURLs) != 1 || len(stream.CandidateURLs()) != 2 {
			t.Fatal("source merging or URL preservation failed")
		}
		for _, source := range stream.Sources {
			if !json.Valid(source.Raw) {
				t.Fatal("original stream record missing")
			}
		}
	}
	if !reflect.DeepEqual(video.Sources[0].StreamGroups, []string{"EF4", "EF6", "EF5", "EF7"}) {
		t.Fatal("wire group order or empty groups were discarded")
	}
	live := notes[1]
	if live.Type != "normal" || !live.HasLivePhoto || len(live.Images) != 8 || live.Video != nil {
		t.Fatal("LivePhoto note was classified as a video note")
	}
	for i, image := range live.Images {
		if image.Index != i || len(image.MotionStreams) != 1 || len(image.Variants) != 2 || image.Variants[0].Scene != "WB_DFT" {
			t.Fatal("LivePhoto still/motion variants are incomplete")
		}
		motion := image.MotionStreams[0]
		if len(image.Variants[0].Sources) != 2 || len(image.Variants[1].Sources) != 2 {
			t.Fatal("deduplicated image aliases lost provenance")
		}
		if motion.Width != nil || motion.Height != nil || motion.FPS != nil || motion.DurationMS != nil {
			t.Fatal("missing motion metadata was fabricated from the still image")
		}
		if len(image.MotionStreamsForCodec("h264")) != 1 || len(motion.CandidateURLs()) != 2 {
			t.Fatal("LivePhoto motion addresses missing")
		}
	}
	if notes[2].HasLivePhoto || notes[2].Video != nil || len(notes[2].Images) != 1 || len(notes[2].Images[0].MotionStreams) != 0 {
		t.Fatal("ordinary image note contains fabricated video")
	}
	if *notes[1].Interactions.Likes != 7230 || notes[1].Interactions.NiceCount != nil || *notes[1].Interactions.Liked {
		t.Fatal("string counters or explicit false were not decoded")
	}
	data := append([]byte(`{"items":`), raw...)
	data = append(data, '}')
	decoded, err := (&Response{Data: data}).DecodeNotes()
	if err != nil || !reflect.DeepEqual(notes, decoded) {
		t.Fatal("response and item-array entry points disagree", err)
	}
	pretty, err := json.Marshal(notes)
	if err != nil || !json.Valid(pretty) {
		t.Fatal("normalized notes cannot be serialized", err)
	}
}

func TestNoteDynamicGroupsStreamsAndImages(t *testing.T) {
	groups := map[string]any{"EF6": []any{}}
	expectedStreams := 0
	for group, count := range map[string]int{"EF4": 9, "EF5": 6, "EF7": 7, "NEW_CODEC": 3} {
		streams := []any{}
		for i := 0; i < count; i++ {
			backups := []string{}
			for j := 0; j < 7; j++ {
				backups = append(backups, fmt.Sprintf("https://media.test/%s/%d/backup-%d", group, i, j))
			}
			streams = append(streams, map[string]any{
				"master_url": fmt.Sprintf("https://media.test/%s/%d?a=1&sig=unchanged", group, i),
				"width":      1000 + i*100, "height": 2000, "fps": 60, "backup_urls": backups,
				"future_field": map[string]any{"keep": true},
			})
		}
		groups[group] = streams
		expectedStreams += count
	}
	groups["EF7"].([]any)[6].(map[string]any)["width"] = 7680
	groups["EF7"].([]any)[6].(map[string]any)["height"] = 4320
	images := []any{}
	for i := 0; i < 13; i++ {
		images = append(images, map[string]any{
			"file_id": fmt.Sprintf("image-%d", i), "width": 1920, "height": 2560, "live_photo": i == 0,
			"info_list": []any{
				map[string]any{"image_scene": "WB_PRV", "url": "preview"},
				map[string]any{"image_scene": "WB_DFT", "url": "default-1", "width": 100, "height": 100},
				map[string]any{"image_scene": "FUTURE_SCENE", "url": "future", "future": []any{1, 2}},
				map[string]any{"image_scene": "WB_DFT", "url": "default-2", "width": 200, "height": 200},
				map[string]any{"url": "without-scene"},
			},
			"url_default": "default-1", "url_pre": "preview", "url": "", "future_image": true,
		})
	}
	images[0].(map[string]any)["stream"] = groups
	raw := noteItemsJSON(t, map[string]any{"type": "future_note_type", "image_list": images, "video": map[string]any{"media": map[string]any{"stream": groups}}})
	notes, err := ParseNoteItems(raw)
	if err != nil {
		t.Fatal(err)
	}
	note := notes[0]
	if note.Type != "future_note_type" || len(note.Video.Streams) != expectedStreams || len(note.Images) != 13 {
		t.Fatal("sample counts or known note kinds were used as limits")
	}
	if note.Video.Streams[0].CodecGroup != "EF7" || *note.Video.Streams[0].Width != 7680 {
		t.Fatal("new higher-resolution codec did not become first")
	}
	if len(note.Video.StreamsForCodec("EF4")) != 9 || len(note.Video.StreamsForCodec("EF7")) != 7 || len(note.Video.StreamsForCodec("NEW_CODEC")) != 3 {
		t.Fatal("dynamic groups/arrays were truncated")
	}
	for _, stream := range note.Video.Streams {
		if len(stream.BackupURLs) != 7 || len(stream.CandidateURLs()) != 8 || stream.Extra["future_field"] == nil {
			t.Fatal("URLs or unknown fields were lost")
		}
		if stream.CodecGroup == "EF7" && stream.Codec != "EF7" {
			t.Fatal("unknown codec was guessed")
		}
	}
	for i, image := range note.Images {
		if image.Index != i || image.FileID != fmt.Sprintf("image-%d", i) || len(image.Variants) != 5 {
			t.Fatal("image order or variant count changed")
		}
		if image.Variants[0].URL != "default-2" || len(image.VariantsForScene("WB_DFT")) != 2 || len(image.VariantsForScene("FUTURE_SCENE")) != 1 {
			t.Fatal("same-scene candidates were overwritten or sorted incorrectly")
		}
		if image.Extra["future_image"] == nil || image.VariantsForScene("FUTURE_SCENE")[0].Extra["future"] == nil {
			t.Fatal("unknown image fields lost")
		}
	}
	if len(note.Images[0].MotionStreams) != expectedStreams || !note.HasLivePhoto {
		t.Fatal("LivePhoto motion has fixed groups/counts")
	}
}

func TestNoteMediaMergeIsConservativeAndOneToOne(t *testing.T) {
	stream := func(url string, bitrate int) map[string]any {
		return map[string]any{"master_url": url, "width": 100, "height": 200, "video_bitrate": bitrate, "backup_urls": []string{"backup-a"}}
	}
	a, b, c := stream("same", 100), stream("same", 100), stream("same", 100)
	a["hdr_type"] = 0
	b["sr"], b["backup_urls"] = 1, []string{"backup-b", "backup-a"}
	card := map[string]any{"video": map[string]any{
		"media_v2": map[string]any{"stream": map[string]any{"EF4": []any{a, c}}},
		"media":    map[string]any{"stream": map[string]any{"EF4": []any{b, c, c, stream("same", 200), stream("different", 100)}, "EF7": []any{stream("same", 100)}}},
	}}
	notes, err := ParseNoteItems(noteItemsJSON(t, card))
	if err != nil {
		t.Fatal(err)
	}
	streams := notes[0].Video.Streams
	if len(streams) != 6 {
		t.Fatalf("same-source or distinct streams were collapsed: %d", len(streams))
	}
	recordCount, merged := 0, 0
	for _, s := range streams {
		recordCount += len(s.Sources)
		if len(s.Sources) == 2 {
			merged++
		}
		if s.SR != nil {
			if *s.SR != 1 || s.HDRType == nil || *s.HDRType != 0 || !reflect.DeepEqual(s.BackupURLs, []string{"backup-a", "backup-b"}) {
				t.Fatal("missing metadata not supplemented, explicit zero lost, or backups incomplete")
			}
		}
	}
	if recordCount != 8 || merged != 2 {
		t.Fatal("cross-source records were not matched one-to-one")
	}
}

func TestNotePartialErrorsKeepUsableDataAndRawSources(t *testing.T) {
	card := map[string]any{
		"note_id": json.Number("9007199254740993123"), "type": "normal", "time": 0,
		"interact_info": map[string]any{"liked_count": "0", "liked": false, "nice_count": ""},
		"image_list":    []any{map[string]any{"width": 200, "height": "bad-height", "info_list": []any{map[string]any{"url": "usable-image"}}}},
		"video": map[string]any{
			"media_v2": "{invalid JSON", "media": map[string]any{
				"video_id": json.Number("138130672442988094"),
				"video":    map[string]any{"duration": 2, "hdr_type": 0, "future": true},
				"stream":   map[string]any{"EF4": []any{map[string]any{"backup_urls": []any{"backup-only", map[string]any{"bad": true}}, "duration": 2000}}, "EF7": map[string]any{"bad": true}},
			},
		},
	}
	notes, err := ParseNoteItems(noteItemsJSON(t, card))
	if err == nil || !strings.Contains(err.Error(), "image_list[0].height") || !strings.Contains(err.Error(), "video.media_v2") || !strings.Contains(err.Error(), `stream["EF7"]`) {
		t.Fatal("partial failures did not include field paths", err)
	}
	note := notes[0]
	if note.ID != "9007199254740993123" || note.Video.VideoID != "138130672442988094" || *note.CreatedAtMS != 0 || *note.Interactions.Likes != 0 || *note.Interactions.Liked {
		t.Fatal("IDs or zero values were corrupted")
	}
	if note.Images[0].Height != nil || len(note.Images[0].Variants) != 1 || len(note.Video.Streams) != 1 || note.Video.Streams[0].CandidateURLs()[0] != "backup-only" {
		t.Fatal("partial errors discarded usable candidates")
	}
	if string(note.Images[0].Extra["height"]) != `"bad-height"` || note.Video.Streams[0].Extra["backup_urls"] == nil {
		t.Fatal("incompatible fields were omitted from pretty output")
	}
	if !bytes.Contains(note.Raw, []byte("bad-height")) || !bytes.Contains(note.Video.Sources[0].Raw, []byte("invalid JSON")) || !bytes.Contains(note.Video.Streams[0].Sources[0].Raw, []byte(`"bad":true`)) {
		t.Fatal("incompatible values are not recoverable from raw records")
	}
}

func TestNoteMediaV2StringAndMissingMotionMetadata(t *testing.T) {
	media := `{"video_id":"123","video":{"duration":2},"stream":{"EF7":[{"master_url":"motion","backup_urls":["backup"]}],"UNKNOWN":[]}}`
	notes, err := ParseNoteItems(noteItemsJSON(t, map[string]any{
		"video":      map[string]any{"media_v2": media},
		"image_list": []any{map[string]any{"live_photo": true, "stream": map[string]any{"EF7": []any{}}}},
	}))
	if err != nil || notes[0].Video.VideoID != "123" || len(notes[0].Video.Streams) != 1 || !notes[0].HasLivePhoto {
		t.Fatal("string media_v2 or flag-only LivePhoto failed", err)
	}
	if notes[0].Video.Streams[0].Width != nil || len(notes[0].Images[0].MotionStreams) != 0 {
		t.Fatal("missing metadata/motion was fabricated")
	}
}

func TestNoteSortingPreservesInputsAndAllCandidates(t *testing.T) {
	streams := []VideoStream{
		{CodecGroup: "EF4", Codec: "h264", MasterURL: "small", StreamMetadata: StreamMetadata{Width: notePointer(int64(100)), Height: notePointer(int64(200)), FPS: notePointer(60.0)}},
		{CodecGroup: "EF7", Codec: "EF7", MasterURL: "big", StreamMetadata: StreamMetadata{Width: notePointer(int64(8000)), Height: notePointer(int64(4000)), FPS: notePointer(60.0)}},
		{CodecGroup: "EF4", Codec: "h264", BackupURLs: []string{"backup"}},
		{CodecGroup: "EMPTY", Codec: "EMPTY", StreamMetadata: StreamMetadata{Width: notePointer(int64(16000)), Height: notePointer(int64(16000))}},
	}
	sorted := SortVideoStreams(streams)
	if len(sorted) != len(streams) || sorted[0].MasterURL != "big" || streams[0].MasterURL != "small" || sorted[3].CodecGroup != "EMPTY" {
		t.Fatal("sort changed input, lost options, or preferred an unavailable URL")
	}
	variants := []ImageVariant{{Scene: "FUTURE", URL: "future"}, {Scene: "WB_DFT", URL: "dft-a"}, {Scene: "WB_DFT", URL: "dft-b"}, {Scene: "WB_DFT"}}
	pretty := SortImageVariants(variants)
	if len(pretty) != len(variants) || pretty[0].URL != "dft-a" || pretty[1].URL != "dft-b" || variants[0].Scene != "FUTURE" {
		t.Fatal("image sorting lost variants or stable source order")
	}
}

func TestNoteInvalidRootsAndNilResponse(t *testing.T) {
	for _, raw := range []string{"null", `{}`, `"items"`, `[null]`} {
		if _, err := ParseNoteItems([]byte(raw)); err == nil {
			t.Fatalf("invalid note root accepted: %s", raw)
		}
	}
	var response *Response
	if _, err := response.DecodeNotes(); err == nil {
		t.Fatal("nil response accepted")
	}
	if _, err := (&Response{Data: []byte(`{"unrelated":[]}`)}).DecodeNotes(); err == nil {
		t.Fatal("missing data.items accepted")
	}
}
