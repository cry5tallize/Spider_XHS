package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	xhsadapter "github.com/cry5tallize/xhs_spider_desktop/internal/adapters/xhs"
	"github.com/cry5tallize/xhs_spider_desktop/internal/app"
	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/downloads"
	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/notes"
	"github.com/cry5tallize/xhs_spider_desktop/internal/platform/paths"
	"github.com/cry5tallize/xhs_spider_desktop/internal/testkit/mediafixture"
)

func runDownload(args []string) (err error) {
	flags := flag.NewFlagSet("download", flag.ContinueOnError)
	fixture := flags.Bool("fixture-server", false, "use only a local fixture server (required)")
	directory := flags.String("data-dir", "", "isolated application data directory (required)")
	output := flags.String("output", "", "download root; default <data-dir>/downloads")
	noteFile := flags.String("note-file", "internal/xhsapi/testdata/note_response.json", "raw local note response")
	if err = flags.Parse(args); err != nil {
		return err
	}
	if flags.NArg() != 0 || !*fixture || *directory == "" {
		return errors.New("usage: desktopcheck download -fixture-server -data-dir <directory> [-output directory] [-note-file file]")
	}
	if *output == "" {
		*output = filepath.Join(*directory, "downloads")
	}
	*output, err = filepath.Abs(*output)
	if err != nil {
		return err
	}
	file, err := os.Open(*noteFile)
	if err != nil {
		return err
	}
	raw, readErr := io.ReadAll(io.LimitReader(file, 32*1024*1024+1))
	err = errors.Join(readErr, file.Close())
	if err != nil {
		return err
	}
	if len(raw) > 32*1024*1024 {
		return errors.New("响应文件过大")
	}
	payloads, err := xhsadapter.DecodeFixture(raw)
	if err != nil {
		return err
	}
	local := mediafixture.NewFixture()
	defer local.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	runtime, err := app.NewRuntime(paths.Development, *directory)
	if err != nil {
		return err
	}
	defer func() { err = errors.Join(err, runtime.Close()) }()
	if err = runtime.Start(ctx); err != nil {
		return err
	}
	ids := []string{}
	for _, p := range payloads {
		var d notes.Detail
		if err = runtime.WithNotes(ctx, func(ctx context.Context, s *notes.Service) error {
			var e error
			d, e = s.ImportPayload(ctx, local.Localize(p))
			return e
		}); err != nil {
			return err
		}
		if err = runtime.WithDownloads(ctx, func(ctx context.Context, s *downloads.Service) error {
			t, e := s.CreateTask(ctx, downloads.CreateTask{RequestID: "fixture-" + d.Snapshot.ID, SnapshotID: d.Snapshot.ID, Config: downloads.Defaults(*output)})
			ids = append(ids, t.ID)
			return e
		}); err != nil {
			return err
		}
	}
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()
	for {
		complete := true
		results := []downloads.Task{}
		err = runtime.WithDownloads(ctx, func(ctx context.Context, s *downloads.Service) error {
			for _, id := range ids {
				t, e := s.GetTask(ctx, id)
				if e != nil {
					return e
				}
				results = append(results, t)
				if t.State == downloads.Queued || t.State == downloads.Running {
					complete = false
				}
			}
			return nil
		})
		if err != nil {
			return err
		}
		if complete {
			encoder := json.NewEncoder(os.Stdout)
			encoder.SetIndent("", "  ")
			if err = encoder.Encode(results); err != nil {
				return err
			}
			for _, t := range results {
				if t.State != downloads.Succeeded {
					return fmt.Errorf("local download %s ended in state %d", t.ID, t.State)
				}
			}
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
		}
	}
}
