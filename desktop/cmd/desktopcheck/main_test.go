package main

import (
	"encoding/json"
	"io"
	"os"
	"testing"

	"github.com/cry5tallize/xhs_spider_desktop/internal/bridge/dto"
)

func capture(t *testing.T, args ...string) (bool, dto.Bootstrap) {
	t.Helper()
	read, write, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	defer read.Close()
	old := os.Stdout
	os.Stdout = write
	defer func() { os.Stdout = old; write.Close() }()
	err = run(args)
	write.Close()
	if err != nil {
		t.Fatal(err)
	}
	raw, err := io.ReadAll(read)
	if err != nil {
		t.Fatal(err)
	}
	var output struct {
		Ephemeral bool          `json:"ephemeral"`
		Bootstrap dto.Bootstrap `json:"bootstrap"`
	}
	if err = json.Unmarshal(raw, &output); err != nil {
		t.Fatal(err)
	}
	return output.Ephemeral, output.Bootstrap
}

func TestDisposableDatabaseIsRemovedAfterClose(t *testing.T) {
	ephemeral, boot := capture(t, "db")
	if !ephemeral || boot.SchemaVersion < 1 {
		t.Fatalf("unexpected output: %+v", boot)
	}
	if _, err := os.Stat(boot.DataDirectory); !os.IsNotExist(err) {
		t.Fatalf("temporary directory survived: %v", err)
	}
}

func TestPersistentDatabaseSurvivesCommandRestart(t *testing.T) {
	directory := t.TempDir()
	ephemeral, boot := capture(t, "db", "-data-dir", directory, "-theme", "3", "-notes", "2")
	if ephemeral {
		t.Fatal("persistent directory treated as disposable")
	}
	_, reopened := capture(t, "db", "-data-dir", directory)
	if reopened.Settings != boot.Settings || reopened.Settings.Revision != 2 {
		t.Fatalf("settings did not persist: %+v", reopened.Settings)
	}
}
