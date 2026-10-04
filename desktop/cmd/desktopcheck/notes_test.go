package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/notes"
)

func TestOfflineImportAndInspectAfterRestart(t *testing.T) {
	directory := t.TempDir()
	output := filepath.Join(directory, "pretty.json")
	if err := run([]string{"parse", "-data-dir", directory, "-note-file", "../../internal/xhsapi/testdata/note_response.json", "-out", output}); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(output)
	if err != nil {
		t.Fatal(err)
	}
	var imported []notes.Detail
	if err = json.Unmarshal(raw, &imported); err != nil || len(imported) != 3 {
		t.Fatalf("import: %v", err)
	}
	if err = run([]string{"inspect", "-data-dir", directory, "-note", imported[0].Note.ID, "-out", output}); err != nil {
		t.Fatal(err)
	}
	raw, err = os.ReadFile(output)
	if err != nil {
		t.Fatal(err)
	}
	var result notes.Detail
	if err = json.Unmarshal(raw, &result); err != nil {
		t.Fatal(err)
	}
	if result.Snapshot.ID != imported[0].Snapshot.ID || result.Note.Video == nil || len(result.Note.Video.Streams) != len(imported[0].Note.Video.Streams) {
		t.Fatal("CLI lost persisted video candidates")
	}
}
