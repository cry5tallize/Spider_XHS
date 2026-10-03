package xhsapi

import (
	"fmt"
	"os"
	"testing"
)

func BenchmarkNoteParseFixture(b *testing.B) {
	raw, err := os.ReadFile("testdata/note_response.json")
	if err != nil {
		b.Fatal(err)
	}
	b.ReportAllocs()
	b.SetBytes(int64(len(raw)))
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if notes, err := ParseNoteItems(raw); err != nil || len(notes) != 3 {
			b.Fatal("fixture parsing failed", err)
		}
	}
}

func benchmarkNoteStreams(count int) []VideoStream {
	streams := make([]VideoStream, count)
	for i := range streams {
		streams[i] = VideoStream{
			CodecGroup: "EF5", Codec: "h265", MasterURL: fmt.Sprintf("https://media.test/stream-%d", i),
			StreamMetadata: StreamMetadata{Width: notePointer(int64(1000 + i%10*100)), Height: notePointer(int64(2000)), FPS: notePointer(60.0)},
			Sources:        []VideoStreamSource{{Name: "media", Raw: []byte(`{}`)}},
		}
		for j := 0; j < 12; j++ {
			streams[i].BackupURLs = append(streams[i].BackupURLs, fmt.Sprintf("https://media.test/stream-%d/backup-%d", i, j))
		}
	}
	return streams
}

func BenchmarkNoteStreamSort(b *testing.B) {
	streams := benchmarkNoteStreams(1000)
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if len(SortVideoStreams(streams)) != len(streams) {
			b.Fatal("streams lost")
		}
	}
}

func BenchmarkNoteStreamMerge(b *testing.B) {
	primary, secondary := benchmarkNoteStreams(1000), benchmarkNoteStreams(1000)
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if len(mergeVideoStreams(primary, secondary)) != len(primary) {
			b.Fatal("source matching failed")
		}
	}
}
