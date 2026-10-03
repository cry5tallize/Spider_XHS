package app

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/cry5tallize/xhs_spider_desktop/internal/platform/paths"
)

func TestRuntimeRepeatedStartCloseAndPersistedSettings(t *testing.T) {
	directory := t.TempDir()
	for i := 0; i < 100; i++ {
		r, err := NewRuntime(paths.Development, directory)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = r.GetGeneral(context.Background()); !errors.Is(err, ErrNotReady) {
			t.Fatal("available before startup")
		}
		if err = r.Start(context.Background()); err != nil {
			t.Fatal(err)
		}
		if err = r.Start(context.Background()); err != nil {
			t.Fatal("repeated start:", err)
		}
		boot, err := r.Bootstrap(context.Background())
		if err != nil || boot.Settings.MaxConcurrentNotes != 4 || boot.SchemaVersion < 1 {
			t.Fatalf("bootstrap: %+v, %v", boot, err)
		}
		if err = r.Close(); err != nil {
			t.Fatal(err)
		}
		if err = r.Close(); err != nil {
			t.Fatal("repeated close:", err)
		}
		if _, err = r.GetGeneral(context.Background()); !errors.Is(err, ErrNotReady) {
			t.Fatal("available after shutdown")
		}
		if err = r.Start(context.Background()); !errors.Is(err, ErrNotReady) {
			t.Fatal("closed runtime restarted")
		}
	}
}

func TestRuntimeFailedStartupRollsBack(t *testing.T) {
	directory := t.TempDir()
	file := filepath.Join(directory, "not-a-directory")
	if err := os.WriteFile(file, []byte("existing content"), 0o600); err != nil {
		t.Fatal(err)
	}
	r, err := NewRuntime(paths.Development, file)
	if err != nil {
		t.Fatal(err)
	}
	if err = r.Start(context.Background()); err == nil {
		t.Fatal("startup should fail")
	}
	if err = r.Close(); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(file)
	if err != nil || string(data) != "existing content" {
		t.Fatal("startup damaged existing file")
	}
}

func TestApplicationCancellationRejectsNewCommands(t *testing.T) {
	r, err := NewRuntime(paths.Development, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	if err = r.Start(ctx); err != nil {
		t.Fatal(err)
	}
	cancel()
	if _, err = r.GetGeneral(context.Background()); !errors.Is(err, ErrNotReady) {
		t.Fatal("accepted after cancellation")
	}
	if err = r.Close(); err != nil {
		t.Fatal(err)
	}
}

func TestCloseCancelsDetachedCommandsBeforeClosingStorage(t *testing.T) {
	r, err := NewRuntime(paths.Development, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if err = r.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	ctx, done, err := r.beginCommand(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	exited := make(chan struct{})
	go func() { <-ctx.Done(); close(exited); done() }()
	if err = r.Close(); err != nil {
		t.Fatal(err)
	}
	select {
	case <-exited:
	default:
		t.Fatal("close did not wait for command")
	}
}
