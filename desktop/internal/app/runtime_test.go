package app

import (
	"context"
	"errors"
	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/downloads"
	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/notes"
	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/settings"
	"github.com/cry5tallize/xhs_spider_desktop/internal/xhsapi"
	"os"
	"path/filepath"
	"testing"

	"github.com/cry5tallize/xhs_spider_desktop/internal/platform/paths"
)

func TestRuntimeDefaultDownloadDirectoryAndReset(t *testing.T) {
	ctx := context.Background()
	data := t.TempDir()
	r, err := NewRuntime(paths.Development, data)
	if err != nil {
		t.Fatal(err)
	}
	defer r.Close()
	if err = r.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defaultDirectory := filepath.Join(data, "downloads")
	boot, err := r.Bootstrap(ctx)
	if err != nil || boot.DefaultDownloadDirectory != defaultDirectory {
		t.Fatal("default not exposed by bootstrap", err)
	}
	config, err := r.GetDownloadDefaults(ctx)
	if err != nil || config.Output.Directory != defaultDirectory {
		t.Fatal("unset directory not resolved", err)
	}
	custom := filepath.Join(data, "custom-output")
	input := settings.UpdateGeneral{ThemeMode: boot.Settings.ThemeMode, MaxConcurrentNotes: boot.Settings.MaxConcurrentNotes, OutputDirectory: custom, ExpectedRevision: boot.Settings.Revision}
	saved, err := r.UpdateGeneral(ctx, input)
	if err != nil {
		t.Fatal(err)
	}
	config, err = r.GetDownloadDefaults(ctx)
	if err != nil || config.Output.Directory != custom {
		t.Fatal("custom directory not used", err)
	}
	input.OutputDirectory = ""
	input.ExpectedRevision = saved.Revision
	if _, err = r.UpdateGeneral(ctx, input); err != nil {
		t.Fatal(err)
	}
	var detail notes.Detail
	err = r.WithNotes(ctx, func(ctx context.Context, n *notes.Service) error {
		var e error
		detail, e = n.ImportPayload(ctx, notes.Payload{Note: xhsapi.Note{ID: "aaaaaaaaaaaaaaaaaaaaaaaa", Title: "offline"}, Raw: []byte(`{}`)})
		return e
	})
	if err != nil {
		t.Fatal(err)
	}
	// An API caller omitting the directory receives the same fallback as the UI.
	err = r.WithDownloads(ctx, func(ctx context.Context, d *downloads.Service) error {
		p, e := d.BuildPlan(ctx, downloads.PlanInput{SnapshotID: detail.Snapshot.ID, Config: downloads.Defaults("")})
		if e != nil {
			return e
		}
		if p.Config.Output.Directory != defaultDirectory {
			t.Fatal("empty task directory bypassed fallback")
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	g, err := r.GetGeneral(ctx)
	if err != nil || g.OutputDirectory != "" {
		t.Fatal("derived default was persisted as a custom absolute path", err)
	}
}

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
