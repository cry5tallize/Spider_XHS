package storage

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"reflect"
	"testing"
	"time"

	xhsadapter "github.com/cry5tallize/xhs_spider_desktop/internal/adapters/xhs"
	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/accounts"
	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/notes"
	"github.com/cry5tallize/xhs_spider_desktop/internal/xhsapi"
)

type testAccounts struct{ store *Store }

func (a testAccounts) List(ctx context.Context) ([]accounts.Account, error) {
	return a.store.ListAccounts(ctx)
}

type testFetch struct {
	start   chan xhsapi.NoteRef
	allow   chan struct{}
	payload notes.Payload
}

func (f testFetch) FetchNote(ctx context.Context, _ string, ref xhsapi.NoteRef) (notes.Payload, error) {
	f.start <- ref
	select {
	case <-ctx.Done():
		return notes.Payload{}, ctx.Err()
	case <-f.allow:
		return f.payload, nil
	}
}
func notePayloads(t *testing.T) []notes.Payload {
	t.Helper()
	raw, err := os.ReadFile("../xhsapi/testdata/note_response.json")
	if err != nil {
		t.Fatal(err)
	}
	payloads, err := xhsadapter.DecodeFixture(raw)
	if err != nil {
		t.Fatal(err)
	}
	return payloads
}
func TestNoteSnapshotsRetainAllMediaAndPageAcrossRestart(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	service, err := notes.NewService(ctx, s, testAccounts{s}, nil)
	if err != nil {
		t.Fatal(err)
	}
	payloads := notePayloads(t)
	var original notes.Detail
	for i, p := range payloads {
		d, e := service.ImportPayload(ctx, p)
		if e != nil {
			t.Fatal(e)
		}
		if i == 0 {
			original = d
		}
	}
	changed := payloads[0]
	changed.Note.Title = "updated title"
	latest, err := service.ImportPayload(ctx, changed)
	if err != nil {
		t.Fatal(err)
	}
	if err = service.Close(); err != nil {
		t.Fatal(err)
	}
	if err = s.Close(); err != nil {
		t.Fatal(err)
	}
	reopened, err := Open(ctx, s.path)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	got, err := reopened.GetSnapshot(ctx, original.Snapshot.ID)
	if err != nil {
		t.Fatal(err)
	}
	wantJSON, _ := json.Marshal(original.Note)
	gotJSON, _ := json.Marshal(got.Note)
	if string(wantJSON) != string(gotJSON) {
		t.Fatal("media or metadata changed during persistence")
	}
	current, err := reopened.GetNote(ctx, original.Note.ID)
	if err != nil || current.Snapshot.ID != latest.Snapshot.ID {
		t.Fatal("latest projection missing")
	}
	raw, err := reopened.GetRawSnapshot(ctx, original.Snapshot.ID)
	if err != nil || raw != string(payloads[0].Raw) {
		t.Fatal("original response lost")
	}
	seen := map[string]bool{}
	input := notes.ListInput{Limit: 1}
	for {
		page, e := reopened.ListNotes(ctx, input)
		if e != nil {
			t.Fatal(e)
		}
		for _, n := range page.Items {
			if seen[n.ID] {
				t.Fatal("duplicate pagination row")
			}
			seen[n.ID] = true
		}
		if !page.HasMore {
			break
		}
		input.BeforeAtMS, input.BeforeID = page.NextAtMS, page.NextID
	}
	if len(seen) != 3 {
		t.Fatalf("lost one of the three note types: %d", len(seen))
	}
	if !reflect.DeepEqual(got.Snapshot.Warnings, original.Snapshot.Warnings) {
		t.Fatal("warnings lost")
	}
}
func createNoteAccount(t *testing.T, s *Store) {
	t.Helper()
	at := time.Now().UnixMilli()
	if err := s.CreateAccount(context.Background(), accounts.Credential{Account: accounts.Account{ID: "test", Name: "test", CreatedAtMS: at, UpdatedAtMS: at}, Provider: accounts.SecretDPAPI, Ciphertext: []byte("protected")}); err != nil {
		t.Fatal(err)
	}
}
func TestCanceledParseCannotCommitLateSnapshot(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	createNoteAccount(t, s)
	p := notePayloads(t)[0]
	p.AccountID = "test"
	p.CredentialVersion = 1
	fetch := testFetch{start: make(chan xhsapi.NoteRef, 1), allow: make(chan struct{}), payload: p}
	service, err := notes.NewService(ctx, s, testAccounts{s}, fetch)
	if err != nil {
		t.Fatal(err)
	}
	defer service.Close()
	input := notes.StartParse{RequestID: "request", Input: "https://www.xiaohongshu.com/explore/" + p.Note.ID + "?xsec_token=a%2Bb&xsec_source=pc_user"}
	job, err := service.StartParse(ctx, input)
	if err != nil {
		t.Fatal(err)
	}
	select {
	case ref := <-fetch.start:
		if ref.Token != "a+b" || ref.Source != "pc_user" {
			t.Fatal("lost signed access parameters")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("worker did not start")
	}
	again, err := service.StartParse(ctx, input)
	if err != nil || again.ID != job.ID {
		t.Fatal("request not idempotent")
	}
	if _, err = service.CancelParse(ctx, job.ID); err != nil {
		t.Fatal(err)
	}
	d := notes.Detail{Note: p.Note, Snapshot: notes.Snapshot{ID: "late", NoteID: p.Note.ID, AccountID: "test", CredentialVersion: 1, ParserVersion: 1, Warnings: []string{}, FetchedAtMS: time.Now().UnixMilli()}}
	if err = s.SaveNoteSnapshot(ctx, job.ID, d, p); !errors.Is(err, notes.ErrConflict) {
		t.Fatalf("late completion accepted: %v", err)
	}
	if _, err = s.GetNote(ctx, p.Note.ID); !errors.Is(err, notes.ErrNotFound) {
		t.Fatal("cancellation transaction did not roll back snapshot/projection")
	}
	if err = service.Close(); err != nil {
		t.Fatal(err)
	}
	final, err := s.GetParseJob(ctx, job.ID)
	if err != nil || final.State != notes.ParseCanceled {
		t.Fatal("canceled state overwritten")
	}
}
func TestParseRecoveryAndStaleAccountGuard(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	createNoteAccount(t, s)
	at := time.Now().UnixMilli()
	job := notes.ParseJob{ID: "unfinished", RequestID: "unfinished", AccountID: "test", NoteID: "target", State: notes.ParseQueued, CreatedAtMS: at, UpdatedAtMS: at, Revision: 1}
	if err := s.CreateParseJob(ctx, job); err != nil {
		t.Fatal(err)
	}
	service, err := notes.NewService(ctx, s, testAccounts{s}, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer service.Close()
	recovered, err := service.GetParseJob(ctx, job.ID)
	if err != nil || recovered.State != notes.ParseInterrupted {
		t.Fatal("unfinished job silently resumed")
	}
	p := notePayloads(t)[0]
	p.AccountID = "test"
	p.CredentialVersion = 1
	if err = s.ReplaceAccountCookie(ctx, "test", []byte("new protected"), accounts.SecretDPAPI, 1, at); err != nil {
		t.Fatal(err)
	}
	if _, err = service.ImportPayload(ctx, p); err == nil {
		t.Fatal("stale account response persisted")
	}
	if _, err = s.GetNote(ctx, p.Note.ID); !errors.Is(err, notes.ErrNotFound) {
		t.Fatal("stale projection committed")
	}
}

func TestSuccessfulParseCommitsJobAndSnapshotTogether(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	createNoteAccount(t, s)
	p := notePayloads(t)[0]
	p.AccountID = "test"
	p.CredentialVersion = 1
	fetch := testFetch{start: make(chan xhsapi.NoteRef, 1), allow: make(chan struct{}), payload: p}
	close(fetch.allow)
	service, err := notes.NewService(ctx, s, testAccounts{s}, fetch)
	if err != nil {
		t.Fatal(err)
	}
	defer service.Close()
	job, err := service.StartParse(ctx, notes.StartParse{RequestID: "complete", Input: p.Note.ID})
	if err != nil {
		t.Fatal(err)
	}
	deadline := time.After(2 * time.Second)
	ticker := time.NewTicker(5 * time.Millisecond)
	defer ticker.Stop()
	for {
		current, err := service.GetParseJob(ctx, job.ID)
		if err != nil {
			t.Fatal(err)
		}
		if current.State == notes.ParseCompleted {
			d, err := service.GetNote(ctx, p.Note.ID)
			if err != nil || current.SnapshotID != d.Snapshot.ID || current.FinishedAtMS == nil {
				t.Fatal("job completed without committed snapshot")
			}
			return
		}
		if current.State == notes.ParseFailed {
			t.Fatalf("parse failed: %+v", current.Failure)
		}
		select {
		case <-deadline:
			t.Fatal("parse did not finish")
		case <-ticker.C:
		}
	}
}
