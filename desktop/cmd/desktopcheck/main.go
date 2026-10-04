// desktopcheck validates application persistence without opening a WebView or using a Cookie.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/cry5tallize/xhs_spider_desktop/internal/app"
	"github.com/cry5tallize/xhs_spider_desktop/internal/bridge/dto"
	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/settings"
	"github.com/cry5tallize/xhs_spider_desktop/internal/platform/paths"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(args []string) (err error) {
	if len(args) > 0 && args[0] == "collect" {
		return runCollect(args[1:])
	}
	if len(args) > 0 && args[0] == "download" {
		return runDownload(args[1:])
	}
	if len(args) > 0 && (args[0] == "parse" || args[0] == "inspect") {
		return runNotes(args)
	}
	if len(args) == 0 || args[0] != "db" {
		return errors.New("usage: desktopcheck db|parse|inspect (see cmd/desktopcheck/README.md)")
	}
	flags := flag.NewFlagSet("db", flag.ContinueOnError)
	directory := flags.String("data-dir", "", "persistent data directory; omitted uses a disposable temporary database")
	theme := flags.Int("theme", 0, "1=system 2=light 3=dark; 0=unchanged")
	notes := flags.Int("notes", 0, "simultaneous notes, 1..32; 0=unchanged")
	if err = flags.Parse(args[1:]); err != nil {
		return err
	}
	if flags.NArg() != 0 {
		return errors.New("unexpected arguments")
	}
	if *theme < 0 || *theme > 3 {
		return errors.New("invalid theme value")
	}
	ephemeral := *directory == ""
	if ephemeral {
		*directory, err = os.MkdirTemp("", "xhs-desktop-check-")
		if err != nil {
			return err
		}
		defer func() {
			// Verify the exact created directory is inside the named temporary root.
			root, e := filepath.Abs(os.TempDir())
			if e != nil {
				err = errors.Join(err, e)
				return
			}
			target, e := filepath.Abs(*directory)
			if e != nil {
				err = errors.Join(err, e)
				return
			}
			rel, e := filepath.Rel(root, target)
			if e != nil || filepath.IsAbs(rel) || rel == "." || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
				err = errors.Join(err, errors.New("refusing to remove an unexpected temporary path"))
				return
			}
			err = errors.Join(err, os.RemoveAll(target))
		}()
	}
	runtime, err := app.NewRuntime(paths.Development, *directory)
	if err != nil {
		return err
	}
	defer func() { err = errors.Join(err, runtime.Close()) }()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err = runtime.Start(ctx); err != nil {
		return err
	}
	boot, err := runtime.Bootstrap(ctx)
	if err != nil {
		return err
	}
	if *theme != 0 || *notes != 0 {
		input := settings.UpdateGeneral{ThemeMode: boot.Settings.ThemeMode, MaxConcurrentNotes: boot.Settings.MaxConcurrentNotes, OutputDirectory: boot.Settings.OutputDirectory, ExpectedRevision: boot.Settings.Revision}
		if *theme != 0 {
			input.ThemeMode = settings.ThemeMode(*theme)
		}
		if *notes != 0 {
			input.MaxConcurrentNotes = *notes
		}
		if boot.Settings, err = runtime.UpdateGeneral(ctx, input); err != nil {
			return err
		}
	}
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	return encoder.Encode(struct {
		Ephemeral bool          `json:"ephemeral"`
		Bootstrap dto.Bootstrap `json:"bootstrap"`
	}{ephemeral, boot})
}
