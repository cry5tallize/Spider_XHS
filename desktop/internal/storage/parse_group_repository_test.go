package storage

import (
	"context"
	"encoding/json"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/accounts"
	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/parsing"
	"github.com/cry5tallize/xhs_spider_desktop/internal/platform/secrets"
	"github.com/cry5tallize/xhs_spider_desktop/internal/testkit/parsefixture"
)

type groupAccounts struct{ store *Store }

func (a groupAccounts) List(ctx context.Context) ([]accounts.Account, error) {
	return a.store.ListAccounts(ctx)
}
func (a groupAccounts) SessionAccount(ctx context.Context, id string) (accounts.Account, error) {
	return a.store.GetAccount(ctx, id)
}
func groupSetup(t *testing.T) (*Store, *parsefixture.Fixture, *parsing.Service) {
	t.Helper()
	if runtime.GOOS != "windows" {
		t.Skip("DPAPI fixture requires Windows")
	}
	store := openTestStore(t)
	createNoteAccount(t, store)
	f := parsefixture.New(notePayloads(t))
	s, err := parsing.NewService(context.Background(), store, groupAccounts{store}, secrets.New(), f)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := s.Close(); err != nil {
			t.Error(err)
		}
	})
	return store, f, s
}
func waitCollection(t *testing.T, s *parsing.Service, id string, want parsing.State) parsing.Job {
	t.Helper()
	deadline := time.After(5 * time.Second)
	timer := time.NewTicker(5 * time.Millisecond)
	defer timer.Stop()
	for {
		j, err := s.Get(context.Background(), id)
		if err != nil {
			t.Fatal(err)
		}
		if j.State == want {
			return j
		}
		if j.State == parsing.Paused || j.State == parsing.Failed {
			t.Fatalf("unexpected state: %+v", j)
		}
		select {
		case <-deadline:
			t.Fatalf("job did not reach state %d", want)
		case <-timer.C:
		}
	}
}
func TestBatchParseDeduplicatesOriginsAndRetriesOnlyFailures(t *testing.T) {
	_, f, s := groupSetup(t)
	ctx := context.Background()
	config := parsing.Defaults()
	config.CacheMode = parsing.ForceRefresh
	first, second := f.Payloads[0].Note.ID, f.Payloads[1].Note.ID
	f.FailOnce = second
	text := "分享：https://www.xiaohongshu.com/explore/" + first + "?xsec_token=private-input-token。\n" + first + "\n" + second + "\ninvalid input"
	job, err := s.Start(ctx, parsing.Start{RequestID: "batch", Mode: parsing.ModeNotes, AccountID: "test", Text: text, Config: config})
	if err != nil {
		t.Fatal(err)
	}
	waitCollection(t, s, job.ID, parsing.Partial)
	page, err := s.Items(ctx, parsing.ItemQuery{JobID: job.ID, Limit: 50})
	if err != nil || len(page.Items) != 2 {
		t.Fatal("batch dedup failed", err)
	}
	if f.Count(first) != 1 || f.Count(second) != 1 {
		t.Fatal("duplicate detail request")
	}
	if page.Items[0].OriginCount != 2 {
		t.Fatal("duplicate origins lost")
	}
	sources, err := s.Sources(ctx, job.ID)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(sources[0].InputBlob), "private-input-token") {
		t.Fatal("input token stored in plaintext")
	}
	public, _ := json.Marshal(sources)
	if strings.Contains(string(public), "private-input-token") || strings.Contains(string(public), "input_blob") {
		t.Fatal("private request returned in DTO")
	}
	if _, err = s.Resume(ctx, job.ID, true); err != nil {
		t.Fatal(err)
	}
	waitCollection(t, s, job.ID, parsing.Partial) // invalid source remains an explicit partial failure.
	if f.Count(first) != 1 || f.Count(second) != 2 {
		t.Fatal("retry repeated successful note or lost failed item")
	}
}
func TestUserParseCommitsPagesAndUsesOwnNoteTokens(t *testing.T) {
	_, f, s := groupSetup(t)
	ctx := context.Background()
	config := parsing.Defaults()
	config.CacheMode = parsing.ForceRefresh
	job, err := s.Start(ctx, parsing.Start{RequestID: "user", Mode: parsing.ModeUsers, AccountID: "test", Text: "https://www.xiaohongshu.com/user/profile/" + parsefixture.UserID + "?xsec_token=user-only-token", Config: config})
	if err != nil {
		t.Fatal(err)
	}
	done := waitCollection(t, s, job.ID, parsing.Succeeded)
	if done.Discovered != 3 || done.Completed != 3 {
		t.Fatal("user page was treated as details or duplicate rows counted")
	}
	sources, err := s.Sources(ctx, job.ID)
	if err != nil || sources[0].Pages != 2 || sources[0].HasMore {
		t.Fatal("cursor/page checkpoint incorrect")
	}
	items, err := s.Items(ctx, parsing.ItemQuery{JobID: job.ID, Limit: 1})
	if err != nil || !items.HasMore {
		t.Fatal("result cursor not available")
	}
	for _, p := range f.Payloads {
		if f.Count(p.Note.ID) != 1 {
			t.Fatal("page duplicate fetched twice")
		}
	}
	origins, err := s.Origins(ctx, items.Items[0].ID)
	if err != nil || len(origins) != 2 || origins[0].Pages != 1 || origins[1].Pages != 2 {
		t.Fatal("discovery page provenance lost")
	}
}
func TestUserParsePauseRestartResumesCommittedCursor(t *testing.T) {
	store, f, s := groupSetup(t)
	ctx := context.Background()
	f.PageTwoStarted = make(chan struct{})
	f.PageTwoRelease = make(chan struct{})
	config := parsing.Defaults()
	config.CacheMode = parsing.ForceRefresh
	job, err := s.Start(ctx, parsing.Start{RequestID: "resume", Mode: parsing.ModeUsers, AccountID: "test", Text: parsefixture.UserID, Config: config})
	if err != nil {
		t.Fatal(err)
	}
	select {
	case <-f.PageTwoStarted:
	case <-time.After(3 * time.Second):
		t.Fatal("second page not reached")
	}
	paused, err := s.Stop(ctx, job.ID, parsing.Paused)
	if err != nil || paused.State != parsing.Paused {
		t.Fatal("pause failed", err)
	}
	if err = s.Close(); err != nil {
		t.Fatal(err)
	}
	close(f.PageTwoRelease)
	next, err := parsing.NewService(ctx, store, groupAccounts{store}, secrets.New(), f)
	if err != nil {
		t.Fatal(err)
	}
	defer next.Close()
	if _, err = next.Resume(ctx, job.ID, false); err != nil {
		t.Fatal(err)
	}
	waitCollection(t, next, job.ID, parsing.Succeeded)
	for _, p := range f.Payloads {
		if f.Count(p.Note.ID) != 1 {
			t.Fatal("resume lost dedup or replayed completed page details")
		}
	}
}
func TestUserParseLimitAndNoRawAreExplicit(t *testing.T) {
	store, f, s := groupSetup(t)
	ctx := context.Background()
	config := parsing.Defaults()
	config.MaxPages = 1
	config.SaveRaw = false
	job, err := s.Start(ctx, parsing.Start{RequestID: "limit", Mode: parsing.ModeUsers, AccountID: "test", Text: parsefixture.UserID, Config: config})
	if err != nil {
		t.Fatal(err)
	}
	done := waitCollection(t, s, job.ID, parsing.Limited)
	if done.Discovered != 2 || done.LimitReason == "" {
		t.Fatal("limit mislabeled as complete")
	}
	items, err := s.Items(ctx, parsing.ItemQuery{JobID: job.ID, Limit: 50})
	if err != nil {
		t.Fatal(err)
	}
	d, err := store.GetSnapshot(ctx, items.Items[0].SnapshotID)
	if err != nil || d.Snapshot.RawAvailable {
		t.Fatal("raw retention toggle ignored")
	}
	if f.Count(f.Payloads[2].Note.ID) != 0 {
		t.Fatal("limit fetched another page")
	}
}
