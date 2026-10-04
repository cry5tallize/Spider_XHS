package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"io"
	"os"
	"strings"
	"time"

	xhsadapter "github.com/cry5tallize/xhs_spider_desktop/internal/adapters/xhs"
	"github.com/cry5tallize/xhs_spider_desktop/internal/app"
	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/accounts"
	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/parsing"
	"github.com/cry5tallize/xhs_spider_desktop/internal/platform/paths"
	"github.com/cry5tallize/xhs_spider_desktop/internal/testkit/parsefixture"
)

func runCollect(args []string) (err error) {
	flags := flag.NewFlagSet("collect", flag.ContinueOnError)
	fixture := flags.Bool("fixture", false, "offline fixture only (required)")
	directory := flags.String("data-dir", "", "isolated data directory (required)")
	mode := flags.String("mode", "users", "notes or users")
	file := flags.String("note-file", "internal/xhsapi/testdata/note_response.json", "local raw note fixture")
	output := flags.String("out", "", "optional result JSON file")
	if err = flags.Parse(args); err != nil {
		return err
	}
	if flags.NArg() != 0 || !*fixture || *directory == "" || (*mode != "notes" && *mode != "users") {
		return errors.New("usage: desktopcheck collect -fixture -data-dir <directory> [-mode notes|users] [-out file]")
	}
	input, err := os.Open(*file)
	if err != nil {
		return err
	}
	raw, readErr := io.ReadAll(io.LimitReader(input, 32*1024*1024+1))
	err = errors.Join(readErr, input.Close())
	if err != nil {
		return err
	}
	if len(raw) > 32*1024*1024 {
		return errors.New("样本文件过大")
	}
	payloads, err := xhsadapter.DecodeFixture(raw)
	if err != nil {
		return err
	}
	if len(payloads) < 3 {
		return errors.New("本地分页样本需要至少三条笔记")
	}
	provider := parsefixture.New(payloads)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	runtime, err := app.NewRuntime(paths.Development, *directory, app.WithParsingFetcher(provider))
	if err != nil {
		return err
	}
	defer func() { err = errors.Join(err, runtime.Close()) }()
	if err = runtime.Start(ctx); err != nil {
		return err
	}
	var account accounts.Account
	err = runtime.WithAccounts(ctx, func(ctx context.Context, s *accounts.Service) error {
		existing, e := s.List(ctx)
		if e != nil {
			return e
		}
		for _, a := range existing {
			if a.Name == "offline-parse-fixture" && a.Enabled {
				account = a
				return nil
			}
		}
		account, e = s.Create(ctx, accounts.Create{Name: "offline-parse-fixture", Cookie: "a1=" + strings.Repeat("0", 52) + "; web_session=synthetic-offline-only"})
		return e
	})
	if err != nil {
		return err
	}
	text := "https://www.xiaohongshu.com/user/profile/" + parsefixture.UserID + "?xsec_token=user-only-token&xsec_source=pc_user"
	kind := parsing.ModeUsers
	if *mode == "notes" {
		kind = parsing.ModeNotes
		text = payloads[0].Note.ID + "\n" + payloads[0].Note.ID + "\n" + payloads[1].Note.ID + "\n" + payloads[2].Note.ID
	}
	var job parsing.Job
	err = runtime.WithParsing(ctx, func(ctx context.Context, s *parsing.Service) error {
		var e error
		config := parsing.Defaults()
		config.CacheMode = parsing.ForceRefresh
		job, e = s.Start(ctx, parsing.Start{RequestID: "fixture-" + time.Now().Format("20060102-150405.000000000"), Mode: kind, AccountID: account.ID, Text: text, Config: config})
		return e
	})
	if err != nil {
		return err
	}
	timer := time.NewTicker(30 * time.Millisecond)
	defer timer.Stop()
	for {
		err = runtime.WithParsing(ctx, func(ctx context.Context, s *parsing.Service) error {
			var e error
			job, e = s.Get(ctx, job.ID)
			return e
		})
		if err != nil {
			return err
		}
		if job.State != parsing.Queued && job.State != parsing.Running {
			break
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-timer.C:
		}
	}
	var page parsing.ItemPage
	var sources []parsing.Source
	err = runtime.WithParsing(ctx, func(ctx context.Context, s *parsing.Service) error {
		var e error
		page, e = s.Items(ctx, parsing.ItemQuery{JobID: job.ID, Limit: 200})
		if e != nil {
			return e
		}
		sources, e = s.Sources(ctx, job.ID)
		return e
	})
	if err != nil {
		return err
	}
	writer := io.Writer(os.Stdout)
	if *output != "" {
		file, e := os.OpenFile(*output, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
		if e != nil {
			return e
		}
		defer func() { err = errors.Join(err, file.Close()) }()
		writer = file
	}
	encoder := json.NewEncoder(writer)
	encoder.SetIndent("", "  ")
	if err = encoder.Encode(struct {
		Job     parsing.Job      `json:"job"`
		Items   parsing.ItemPage `json:"items"`
		Sources []parsing.Source `json:"sources"`
	}{job, page, sources}); err != nil {
		return err
	}
	if job.State != parsing.Succeeded {
		return errors.New("本地解析没有完整完成，请查看输出记录")
	}
	return nil
}
