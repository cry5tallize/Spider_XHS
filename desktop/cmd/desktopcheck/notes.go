package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"io"
	"os"
	"time"

	xhsadapter "github.com/cry5tallize/xhs_spider_desktop/internal/adapters/xhs"
	"github.com/cry5tallize/xhs_spider_desktop/internal/app"
	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/downloads"
	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/notes"
	"github.com/cry5tallize/xhs_spider_desktop/internal/platform/paths"
)

// These commands never send an HTTP request. Use a named directory so imports
// can subsequently be inspected or opened by the development application.
func runNotes(args []string) (err error) {
	flags := flag.NewFlagSet(args[0], flag.ContinueOnError)
	directory := flags.String("data-dir", "", "application data directory (required)")
	file := flags.String("note-file", "", "raw items array/feed response for offline import")
	id := flags.String("note", "", "note ID to inspect; omitted lists recent notes")
	taskID := flags.String("task", "", "download task ID to inspect")
	history := flags.Bool("history", false, "list note-based download history")
	out := flags.String("out", "", "optional Pretty JSON output file")
	if err = flags.Parse(args[1:]); err != nil {
		return err
	}
	if flags.NArg() != 0 || *directory == "" {
		return errors.New("需要 -data-dir 指定数据目录")
	}
	if args[0] == "parse" && *file == "" {
		return errors.New("离线解析需要 -note-file")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	runtime, err := app.NewRuntime(paths.Development, *directory)
	if err != nil {
		return err
	}
	defer func() { err = errors.Join(err, runtime.Close()) }()
	if err = runtime.Start(ctx); err != nil {
		return err
	}
	var result any
	if args[0] == "parse" {
		input, err := os.Open(*file)
		if err != nil {
			return err
		}
		raw, readErr := io.ReadAll(io.LimitReader(input, 32*1024*1024+1))
		closeErr := input.Close()
		if err = errors.Join(readErr, closeErr); err != nil {
			return err
		}
		if len(raw) > 32*1024*1024 {
			return errors.New("响应文件不能超过 32 MiB")
		}
		payloads, err := xhsadapter.DecodeFixture(raw)
		if err != nil {
			return err
		}
		details := make([]notes.Detail, 0, len(payloads))
		err = runtime.WithNotes(ctx, func(ctx context.Context, s *notes.Service) error {
			for _, p := range payloads {
				d, e := s.ImportPayload(ctx, p)
				if e != nil {
					return e
				}
				details = append(details, d)
			}
			return nil
		})
		if err != nil {
			return err
		}
		result = details
	} else {
		if *taskID != "" || *history {
			err = runtime.WithDownloads(ctx, func(ctx context.Context, s *downloads.Service) error {
				if *history {
					var e error
					result, e = s.List(ctx, downloads.ListInput{Limit: 50}, true)
					return e
				}
				t, e := s.GetTask(ctx, *taskID)
				if e != nil {
					return e
				}
				items, e := s.Items(ctx, *taskID)
				result = struct {
					Task  downloads.Task   `json:"task"`
					Items []downloads.Item `json:"items"`
				}{t, items}
				return e
			})
		} else {
			err = runtime.WithNotes(ctx, func(ctx context.Context, s *notes.Service) error {
				var e error
				if *id != "" {
					result, e = s.GetNote(ctx, *id)
				} else {
					result, e = s.ListNotes(ctx, notes.ListInput{Limit: 50})
				}
				return e
			})
		}
		if err != nil {
			return err
		}
	}
	writer := io.Writer(os.Stdout)
	if *out != "" {
		output, e := os.OpenFile(*out, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
		if e != nil {
			return e
		}
		defer func() { err = errors.Join(err, output.Close()) }()
		writer = output
	}
	encoder := json.NewEncoder(writer)
	encoder.SetIndent("", "  ")
	return encoder.Encode(result)
}
