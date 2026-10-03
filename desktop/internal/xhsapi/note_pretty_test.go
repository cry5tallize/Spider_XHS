package xhsapi

import (
	"bytes"
	"encoding/json"
	"reflect"
	"testing"
)

func TestImageURLDedupPrefersWebDftAndKeepsSources(t *testing.T) {
	const url = "https://images.test/file?sig=exact&a=1"
	variants := []ImageVariant{
		{Scene: "WB_PRV", Source: "info_list", Index: 0, URL: url, Width: notePointer(int64(10)), Height: notePointer(int64(20))},
		{Scene: "DFT", Source: "info_list", Index: 1, URL: url, Width: notePointer(int64(8000)), Extra: map[string]json.RawMessage{"conflict": []byte(`"generic"`)}},
		{Source: "url_default", Index: 3, URL: url},
		{Scene: "WebDft", Source: "info_list", Index: 2, URL: url, Width: notePointer(int64(100)), Format: "webp", Extra: map[string]json.RawMessage{"conflict": []byte(`"web"`)}},
		{Scene: "WB_DFT", Source: "info_list", Index: 4, URL: url + "&a=2"},
		{Scene: "FUTURE_SCENE", Source: "info_list", Index: 5, URL: "https://images.test/other"},
		{Source: "url", Index: 6},
	}
	before, _ := json.Marshal(variants)
	result := NormalizeImageVariants(variants)
	if len(result) != 3 || result[0].URL != url || result[0].Scene != "WebDft" || *result[0].Width != 100 || *result[0].Height != 20 || result[0].Format != "webp" {
		t.Fatal("WebDft representative or missing-field supplement incorrect")
	}
	if len(result[0].Sources) != 4 || string(result[0].Extra["conflict"]) != `"web"` {
		t.Fatal("alternate scene metadata was discarded")
	}
	image := NoteImageInfo{Variants: result}
	if len(image.VariantsForScene("WB_PRV")) != 1 || len(image.VariantsForScene("WB_DFT")) != 2 || len(image.VariantsForScene("DFT")) != 1 {
		t.Fatal("scene filtering does not consult merged sources")
	}
	after, _ := json.Marshal(variants)
	if !bytes.Equal(before, after) || !reflect.DeepEqual(result, NormalizeImageVariants(result)) {
		t.Fatal("normalization mutated input or is not idempotent")
	}
	encoded, err := json.Marshal(result)
	if err != nil || bytes.Count(encoded, []byte(`"url":`)) != 3 {
		t.Fatal("image URL repeated in normalized sources", err)
	}
}

func TestVideoURLDedupKeepsDistinctSignedAddresses(t *testing.T) {
	const master = "https://media.test/video?sig=exact"
	stream := map[string]any{
		"master_url": master, "url": master,
		"backup_urls": []string{master, "", "backup", "backup", master + "&a=1", master + "&a=2"},
	}
	notes, err := ParseNoteItems(noteItemsJSON(t, map[string]any{"video": map[string]any{"media": map[string]any{"stream": map[string]any{"EF7": []any{stream}}}}}))
	if err != nil {
		t.Fatal(err)
	}
	parsed := notes[0].Video.Streams[0]
	if parsed.URL != "" || !reflect.DeepEqual(parsed.BackupURLs, []string{"backup", master + "&a=1", master + "&a=2"}) || len(parsed.CandidateURLs()) != 4 {
		t.Fatal("video aliases retained or signed URLs incorrectly combined")
	}
	if !bytes.Contains(parsed.Sources[0].Raw, []byte(`"url":`)) {
		t.Fatal("original video URL aliases lost")
	}
	encoded, err := json.Marshal(parsed)
	if err != nil || bytes.Contains(encoded, []byte(`"raw":`)) {
		t.Fatal("stream source duplicates raw links in pretty JSON", err)
	}
}

func TestIndexedStreamMergeHandlesCollidingKeysAndMetadata(t *testing.T) {
	base := func(width int64, index int) VideoStream {
		return VideoStream{CodecGroup: "EF4", Codec: "h264", MasterURL: "same", StreamMetadata: StreamMetadata{Width: notePointer(width)}, Sources: []VideoStreamSource{{Index: index}}}
	}
	primary := []VideoStream{base(100, 0), base(200, 1), base(300, 2), base(100, 3)}
	secondary := []VideoStream{base(200, 10), base(300, 11), base(100, 12), base(100, 13), base(400, 14)}
	merged := mergeVideoStreams(primary, secondary)
	if len(merged) != 5 {
		t.Fatal("colliding URL keys discarded distinct specs")
	}
	for i, expected := range []int{12, 10, 11, 13} {
		if len(merged[i].Sources) != 2 || merged[i].Sources[1].Index != expected || len(primary[i].Sources) != 1 {
			t.Fatal("indexed matching changed one-to-one source order or inputs")
		}
	}
	if merged[4].Sources[0].Index != 14 {
		t.Fatal("unmatched stream was lost")
	}
}

func TestStreamMetadataConflictsRemainDistinct(t *testing.T) {
	// Every scalar in the typed metadata must participate in compatibility;
	// removing reflection from the matcher must not omit future additions.
	metadataType := reflect.TypeOf(StreamMetadata{})
	for i := 0; i < metadataType.NumField(); i++ {
		field := metadataType.Field(i)
		t.Run(field.Name, func(t *testing.T) {
			var a, b StreamMetadata
			left, right := reflect.ValueOf(&a).Elem().Field(i), reflect.ValueOf(&b).Elem().Field(i)
			if left.Kind() == reflect.String {
				left.SetString("one")
				right.SetString("two")
			} else {
				one, two := reflect.New(left.Type().Elem()), reflect.New(right.Type().Elem())
				if one.Elem().Kind() == reflect.Int64 {
					one.Elem().SetInt(1)
					two.Elem().SetInt(2)
				} else {
					one.Elem().SetFloat(1)
					two.Elem().SetFloat(2)
				}
				left.Set(one)
				right.Set(two)
			}
			primary := VideoStream{CodecGroup: "EF4", MasterURL: "same", StreamMetadata: a}
			secondary := VideoStream{CodecGroup: "EF4", MasterURL: "same", StreamMetadata: b}
			if len(mergeVideoStreams([]VideoStream{primary}, []VideoStream{secondary})) != 2 {
				t.Fatal("conflicting metadata was merged")
			}
			fallback := VideoStream{CodecGroup: "EF4", MasterURL: "same"}
			merged := mergeVideoStreams([]VideoStream{fallback}, []VideoStream{secondary})
			if len(merged) != 1 || !reflect.DeepEqual(merged[0].StreamMetadata, b) {
				t.Fatal("missing metadata not supplemented")
			}
		})
	}
}

func TestStreamSortAvoidsAllocationsPerComparison(t *testing.T) {
	streams := benchmarkNoteStreams(128)
	var sorted []VideoStream
	allocations := testing.AllocsPerRun(10, func() { sorted = SortVideoStreams(streams) })
	if len(sorted) != len(streams) || allocations > 10 {
		t.Fatalf("sorting allocates per comparison: %.0f allocations", allocations)
	}
}

func TestNoteParserRetainsOwnedRawAfterCallerChangesInput(t *testing.T) {
	raw := noteItemsJSON(t, map[string]any{
		"image_list": []any{map[string]any{"info_list": []any{map[string]any{"image_scene": "WB_DFT", "url": "image", "future": true}}}},
		"video":      map[string]any{"media": map[string]any{"stream": map[string]any{"EF4": []any{map[string]any{"master_url": "video", "backup_urls": []string{"backup"}}}}}},
	})
	notes, err := ParseNoteItems(raw)
	if err != nil {
		t.Fatal(err)
	}
	before, _ := json.Marshal(notes)
	for i := range raw {
		raw[i] = ' '
	}
	after, _ := json.Marshal(notes)
	if !bytes.Equal(before, after) || !json.Valid(notes[0].Raw) || !json.Valid(notes[0].Images[0].Variants[0].Sources[0].Raw) || !json.Valid(notes[0].Video.Streams[0].Sources[0].Raw) {
		t.Fatal("raw-copy optimization kept a reference to mutable caller bytes")
	}
}
