package mediahttp

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/downloads"
	"github.com/cry5tallize/xhs_spider_desktop/internal/testkit/mediafixture"
)

func TestStreamingBackupValidationAndSafeOverwrite(t *testing.T) {
	f := mediafixture.NewFixture()
	defer f.Close()
	e := New()
	defer e.Close()
	c := downloads.Defaults(t.TempDir())
	c.Execution.RetriesPerURL = 0
	target := filepath.Join(c.Output.Directory, "image.png")
	if err := os.WriteFile(target, []byte("previous-file"), 0o600); err != nil {
		t.Fatal(err)
	}
	i := downloads.Item{ID: "fixture", PlannedItem: downloads.PlannedItem{Kind: downloads.MediaImage, RelativePath: "image.png", URLs: []string{f.Server.URL + "/denied", f.Server.URL + "/image/test"}}}
	attempts := 0
	p, err := e.Prepare(context.Background(), c, i, func(downloads.Progress) {}, func(downloads.Attempt) { attempts++ })
	if err != nil || attempts != 2 {
		t.Fatal("backup download failed", err)
	}
	old, _ := os.ReadFile(target)
	if string(old) != "previous-file" {
		t.Fatal("formal file truncated before validation/commit")
	}
	result, err := e.Commit(context.Background(), c, i, p)
	if err != nil || !e.Verify(context.Background(), result, true) {
		t.Fatal("safe overwrite or checksum failed", err)
	}
	i.ID = "denied"
	i.URLs = []string{f.Server.URL + "/denied"}
	if _, err = e.Prepare(context.Background(), c, i, func(downloads.Progress) {}, func(downloads.Attempt) {}); err == nil {
		t.Fatal("error page saved as image")
	}
	if !e.Verify(context.Background(), result, true) {
		t.Fatal("failed attempt damaged existing file")
	}
}
