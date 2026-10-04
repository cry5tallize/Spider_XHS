package storage

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/cry5tallize/xhs_spider_desktop/internal/adapters/mediahttp"
	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/downloads"
	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/notes"
	"github.com/cry5tallize/xhs_spider_desktop/internal/testkit/mediafixture"
	"github.com/cry5tallize/xhs_spider_desktop/internal/xhsapi"
)

type trackedDownload struct {
	downloads.Executor
	mu            sync.Mutex
	running, peak int
	perTask       map[string]int
	serial        bool
	gate          chan struct{}
	once          sync.Once
}

func (e *trackedDownload) Prepare(ctx context.Context, c downloads.Config, i downloads.Item, p func(downloads.Progress), a func(downloads.Attempt)) (downloads.Prepared, error) {
	noteKey := filepath.Dir(i.RelativePath)
	e.mu.Lock()
	e.running++
	e.perTask[noteKey]++
	if e.perTask[noteKey] > 1 {
		e.serial = false
	}
	if e.running > e.peak {
		e.peak = e.running
	}
	if e.running == 2 {
		e.once.Do(func() { close(e.gate) })
	}
	e.mu.Unlock()
	defer func() { e.mu.Lock(); e.running--; e.perTask[noteKey]--; e.mu.Unlock() }()
	select {
	case <-ctx.Done():
		return downloads.Prepared{}, ctx.Err()
	case <-e.gate:
	}
	return e.Executor.Prepare(ctx, c, i, p, a)
}
func saveDownloadNote(t *testing.T, s *Store, p notes.Payload) notes.Detail {
	t.Helper()
	n, err := notes.NewService(context.Background(), s, testAccounts{s}, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer n.Close()
	d, err := n.ImportPayload(context.Background(), p)
	if err != nil {
		t.Fatal(err)
	}
	return d
}
func waitDownload(t *testing.T, s *downloads.Service, id string, want downloads.State) downloads.Task {
	t.Helper()
	deadline := time.After(5 * time.Second)
	ticker := time.NewTicker(5 * time.Millisecond)
	defer ticker.Stop()
	for {
		v, err := s.GetTask(context.Background(), id)
		if err != nil {
			t.Fatal(err)
		}
		if v.State == want {
			return v
		}
		if v.State == downloads.Interrupted || v.State == downloads.Failed {
			t.Fatalf("unexpected terminal state: %+v", v)
		}
		select {
		case <-deadline:
			t.Fatalf("task did not reach state %d", want)
		case <-ticker.C:
		}
	}
}
func TestDownloadNotesConcurrentItemsSerialAndHistoryCoverage(t *testing.T) {
	store := openTestStore(t)
	fixture := mediafixture.NewFixture()
	defer fixture.Close()
	payloads := notePayloads(t)
	details := []notes.Detail{}
	for _, p := range payloads[:2] {
		details = append(details, saveDownloadNote(t, store, fixture.Localize(p)))
	}
	executor := &trackedDownload{Executor: mediahttp.New(), perTask: map[string]int{}, serial: true, gate: make(chan struct{})}
	s, err := downloads.NewService(context.Background(), store, executor, 2, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	config := downloads.Defaults(t.TempDir())
	first, err := s.CreateTask(context.Background(), downloads.CreateTask{RequestID: "first", SnapshotID: details[0].Snapshot.ID, Config: config})
	if err != nil {
		t.Fatal(err)
	}
	second, err := s.CreateTask(context.Background(), downloads.CreateTask{RequestID: "second", SnapshotID: details[1].Snapshot.ID, Config: config})
	if err != nil {
		t.Fatal(err)
	}
	duplicate, err := s.CreateTask(context.Background(), downloads.CreateTask{RequestID: "duplicate", SnapshotID: details[0].Snapshot.ID, Config: config})
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{first.ID, second.ID, duplicate.ID} {
		waitDownload(t, s, id, downloads.Succeeded)
	}
	executor.mu.Lock()
	peak, serial := executor.peak, executor.serial
	executor.mu.Unlock()
	if peak != 2 || !serial {
		t.Fatalf("note/item concurrency wrong: peak=%d serial=%v", peak, serial)
	}
	items, err := s.Items(context.Background(), duplicate.ID)
	if err != nil {
		t.Fatal(err)
	}
	if items[0].State != downloads.ItemSkipped || items[0].Result.SkipReason != downloads.SkipHistory {
		t.Fatal("existing asset was not verified and reused")
	}
	page, err := s.List(context.Background(), downloads.ListInput{Limit: 50}, true)
	if err != nil || len(page.Items) != 3 {
		t.Fatal("history was split into file records")
	}
	// Missing one prior file must download that item again, not skip the note.
	if err = os.Remove(filepath.Join(items[0].Result.Root, items[0].Result.RelativePath)); err != nil {
		t.Fatal(err)
	}
	fourth, err := s.CreateTask(context.Background(), downloads.CreateTask{RequestID: "missing", SnapshotID: details[0].Snapshot.ID, Config: config})
	if err != nil {
		t.Fatal(err)
	}
	waitDownload(t, s, fourth.ID, downloads.Succeeded)
	rebuilt, err := s.Items(context.Background(), fourth.ID)
	if err != nil || rebuilt[0].State != downloads.ItemSucceeded {
		t.Fatal("missing file incorrectly filtered")
	}
	// History cursor uses first execution time, independently of task creation.
	seen := map[string]bool{}
	cursor := downloads.ListInput{Limit: 1}
	for {
		page, e := s.List(context.Background(), cursor, true)
		if e != nil {
			t.Fatal(e)
		}
		for _, row := range page.Items {
			if seen[row.ID] {
				t.Fatal("duplicate history cursor row")
			}
			seen[row.ID] = true
		}
		if !page.HasMore {
			break
		}
		cursor.BeforeAtMS, cursor.BeforeID = page.NextAtMS, page.NextID
	}
	if len(seen) != 4 {
		t.Fatal("history pagination lost note tasks")
	}
	if err = s.Close(); err != nil {
		t.Fatal(err)
	}
	if err = store.Close(); err != nil {
		t.Fatal(err)
	}
	reopened, err := Open(context.Background(), store.path)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	page, err = reopened.ListDownloadTasks(context.Background(), downloads.ListInput{Limit: 50}, true)
	if err != nil || len(page.Items) != 4 {
		t.Fatal("history lost after restart")
	}
}
func TestDownloadPauseResumeAndCancelCleanIO(t *testing.T) {
	store := openTestStore(t)
	started := make(chan struct{}, 8)
	release := make(chan struct{})
	var cancelMode atomic.Bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "video/mp4")
		w.Write([]byte{0, 0, 0, 24, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm', 0, 0, 0, 0, 'i', 's', 'o', 'm', 'm', 'p', '4', '2'})
		w.(http.Flusher).Flush()
		started <- struct{}{}
		if cancelMode.Load() {
			<-r.Context().Done()
			return
		}
		select {
		case <-r.Context().Done():
		case <-release:
		}
	}))
	defer server.Close()
	stream := xhsapi.VideoStream{StreamMetadata: xhsapi.StreamMetadata{Format: "mp4"}, URL: server.URL, CodecGroup: "EF7"}
	p := notes.Payload{Note: xhsapi.Note{ID: "aaaaaaaaaaaaaaaaaaaaaaaa", Type: "video", Video: &xhsapi.NoteVideoInfo{Streams: []xhsapi.VideoStream{stream}}}, Raw: json.RawMessage(`{}`)}
	d := saveDownloadNote(t, store, p)
	s, err := downloads.NewService(context.Background(), store, mediahttp.New(), 1, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	c := downloads.Defaults(t.TempDir())
	c.Media.Pretty = false
	c.Media.Manifest = false
	c.Execution.RetriesPerURL = 0
	task, err := s.CreateTask(context.Background(), downloads.CreateTask{RequestID: "pause", SnapshotID: d.Snapshot.ID, Config: c})
	if err != nil {
		t.Fatal(err)
	}
	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("request did not start")
	}
	paused, err := s.Stop(context.Background(), task.ID, downloads.Paused)
	if err != nil || paused.State != downloads.Paused {
		t.Fatal("pause failed", err)
	}
	if _, err = s.Resume(context.Background(), task.ID); err != nil {
		t.Fatal(err)
	}
	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("resume did not start")
	}
	close(release)
	waitDownload(t, s, task.ID, downloads.Succeeded)
	// A second blocked note is canceled while its body is open.
	cancelMode.Store(true)
	c.Dedup.Force = true
	canceled, err := s.CreateTask(context.Background(), downloads.CreateTask{RequestID: "cancel", SnapshotID: d.Snapshot.ID, Config: c})
	if err != nil {
		t.Fatal(err)
	}
	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("cancel request did not start")
	}
	end, err := s.Stop(context.Background(), canceled.ID, downloads.Canceled)
	if err != nil || end.State != downloads.Canceled {
		t.Fatal("cancel failed", err)
	}
	if _, err = s.Resume(context.Background(), canceled.ID); !errors.Is(err, downloads.ErrConflict) {
		t.Fatal("canceled task resumed")
	}
	var parts []string
	filepath.WalkDir(c.Output.Directory, func(path string, entry os.DirEntry, err error) error {
		if err == nil && !entry.IsDir() && strings.Contains(entry.Name(), ".part.") {
			parts = append(parts, path)
		}
		return err
	})
	if len(parts) > 0 {
		t.Fatal("temporary files leaked")
	}
}

func TestDownloadFinalizeJournalRecoveryWithoutDuplicateHistory(t *testing.T) {
	store := openTestStore(t)
	fixture := mediafixture.NewFixture()
	defer fixture.Close()
	p := fixture.Localize(notePayloads(t)[0])
	d := saveDownloadNote(t, store, p)
	c := downloads.Defaults(t.TempDir())
	c.Media.Pretty = false
	c.Media.Manifest = false
	plan, err := downloads.BuildPlan(d, c, nil)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	if err = store.CreateDownloadTask(ctx, "journal-task", "journal-request", plan); err != nil {
		t.Fatal(err)
	}
	task, err := store.ClaimDownloadTask(ctx)
	if err != nil {
		t.Fatal(err)
	}
	items, err := store.DownloadItems(ctx, task.ID)
	if err != nil {
		t.Fatal(err)
	}
	item := items[0]
	if err = store.StartDownloadItem(ctx, task, item); err != nil {
		t.Fatal(err)
	}
	e := mediahttp.New()
	prepared, err := e.Prepare(ctx, c, item, func(downloads.Progress) {}, func(downloads.Attempt) {})
	if err != nil {
		t.Fatal(err)
	}
	if err = store.FinalizeDownloadItem(ctx, item.ID, prepared); err != nil {
		t.Fatal(err)
	}
	if _, err = e.Commit(ctx, c, item, prepared); err != nil {
		t.Fatal(err)
	}
	e.Close()
	// Simulate termination after rename but before the success DB transaction.
	if err = store.Close(); err != nil {
		t.Fatal(err)
	}
	reopened, err := Open(ctx, store.path)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	s, err := downloads.NewService(ctx, reopened, mediahttp.New(), 1, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	recovered, err := s.Items(ctx, task.ID)
	if err != nil || recovered[0].State != downloads.ItemSucceeded {
		t.Fatal("validated final file not recovered")
	}
	if _, err = s.Resume(ctx, task.ID); err != nil {
		t.Fatal(err)
	}
	waitDownload(t, s, task.ID, downloads.Succeeded)
	history, err := s.List(ctx, downloads.ListInput{Limit: 50}, true)
	if err != nil || len(history.Items) != 1 {
		t.Fatal("recovery created duplicate history")
	}
}

func TestDownloadBatchIsAtomicNoteBasedAndPresetRetainsConfiguration(t *testing.T) {
	store := openTestStore(t)
	fixture := mediafixture.NewFixture()
	defer fixture.Close()
	payloads := notePayloads(t)
	details := []notes.Detail{}
	for _, p := range payloads {
		details = append(details, saveDownloadNote(t, store, fixture.Localize(p)))
	}
	s, err := downloads.NewService(context.Background(), store, mediahttp.New(), 2, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	ctx := context.Background()
	config := downloads.Defaults(t.TempDir())
	config.Selection.Video.Mode = downloads.VideoAll
	config.Selection.Images.Mode = downloads.ImageAll
	ids := []string{details[0].Snapshot.ID, details[1].Snapshot.ID, details[0].Snapshot.ID}
	request := downloads.CreateBatch{RequestID: "batch-create", SnapshotIDs: ids, Config: config}
	b, err := s.CreateTasks(ctx, request)
	if err != nil || len(b.TaskIDs) != 2 {
		t.Fatal("batch not one task per unique note", err)
	}
	again, err := s.CreateTasks(ctx, request)
	if err != nil || again.ID != b.ID {
		t.Fatal("batch not idempotent")
	}
	for _, id := range b.TaskIDs {
		task := waitDownload(t, s, id, downloads.Succeeded)
		if task.BatchID != b.ID {
			t.Fatal("batch relationship lost")
		}
	}
	request.RequestID = "invalid-batch"
	request.SnapshotIDs = []string{details[0].Snapshot.ID, "missing"}
	if _, err = s.CreateTasks(ctx, request); err == nil {
		t.Fatal("invalid snapshot accepted")
	}
	page, err := s.List(ctx, downloads.ListInput{Limit: 50}, false)
	if err != nil || len(page.Items) != 2 {
		t.Fatal("partially created invalid batch")
	}
	preset, err := s.SavePreset(ctx, downloads.SavePreset{Name: "all formats", Config: config})
	if err != nil {
		t.Fatal(err)
	}
	presets, err := s.ListPresets(ctx)
	if err != nil || len(presets) != 1 || presets[0].Config.Selection.Video.Mode != downloads.VideoAll {
		t.Fatal("preset selection not retained")
	}
	if err = s.DeletePreset(ctx, preset.ID); err != nil {
		t.Fatal(err)
	}
	items, err := s.Items(ctx, b.TaskIDs[1])
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, item := range items {
		if item.Kind == downloads.MediaManifest {
			raw, e := os.ReadFile(filepath.Join(item.Result.Root, item.Result.RelativePath))
			if e != nil {
				t.Fatal(e)
			}
			var manifest map[string]json.RawMessage
			if e = json.Unmarshal(raw, &manifest); e != nil {
				t.Fatal(e)
			}
			if len(manifest["live_pairs"]) > 2 {
				found = true
			}
		}
	}
	if !found {
		t.Fatal("LivePhoto pair choices not exported in manifest")
	}
}
