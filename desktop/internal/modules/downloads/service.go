package downloads

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/notes"
)

type Repository interface {
	GetSnapshot(context.Context, string) (notes.Detail, error)
	GetRawSnapshot(context.Context, string) (string, error)
	CreateDownloadTask(context.Context, string, string, Plan) error
	GetDownloadTask(context.Context, string) (Task, error)
	FindDownloadRequest(context.Context, string) (Task, error)
	ListDownloadTasks(context.Context, ListInput, bool) (Page, error)
	ActiveDownloadTasks(context.Context) ([]Task, error)
	ClaimDownloadTask(context.Context) (Task, error)
	DownloadItems(context.Context, string) ([]Item, error)
	StartDownloadItem(context.Context, Task, Item) error
	CheckpointDownload(context.Context, Task, Item) error
	SaveDownloadAttempt(context.Context, Attempt) error
	FinalizeDownloadItem(context.Context, string, Prepared) error
	DownloadJournals(context.Context) ([]FinalizeEntry, error)
	AbandonDownloadFinalization(context.Context, string) error
	SettleDownloadItem(context.Context, Item, ItemState, Result, *Failure) error
	FinishDownloadTask(context.Context, string, State, *Failure) error
	StopDownloadTask(context.Context, string, State) error
	ResumeDownloadTask(context.Context, string) error
	CoveredDownloadFiles(context.Context, Task, Item) ([]CoveredFile, error)
	RecoverDownloads(context.Context) error
}
type activeTask struct {
	mu         sync.Mutex
	task       Task
	item       Item
	cancel     context.CancelFunc
	stop       State
	done       chan struct{}
	checkpoint time.Time
}
type Service struct {
	mu                     sync.Mutex
	repository             Repository
	executor               Executor
	ctx                    context.Context
	cancel                 context.CancelFunc
	hub                    *Hub
	active                 map[string]*activeTask
	max                    int
	wake                   chan struct{}
	workers                sync.WaitGroup
	dispatcher             chan struct{}
	closing                bool
	once                   sync.Once
	closeErr               error
	resolveOutputDirectory func(context.Context) (string, error)
}

// SetOutputDirectoryResolver is wired once during startup, before commands run.
func (s *Service) SetOutputDirectoryResolver(resolve func(context.Context) (string, error)) {
	s.resolveOutputDirectory = resolve
}

func NewService(parent context.Context, r Repository, e Executor, max int, emit func(EventBatch)) (*Service, error) {
	if max < 1 || max > 32 {
		return nil, errors.New("笔记并发必须为 1～32")
	}
	// Resolve journaled, validated files before interrupting unfinished work.
	entries, err := r.DownloadJournals(parent)
	if err != nil {
		return nil, err
	}
	for _, v := range entries {
		result := Result{Root: v.Task.Config.Output.Directory, RelativePath: v.Item.RelativePath, Bytes: v.Prepared.Bytes, SHA256: v.Prepared.SHA256}
		if !e.Verify(parent, result, true) {
			part := result
			part.RelativePath = v.Prepared.TemporaryPath
			if !e.Verify(parent, part, true) {
				if err = r.AbandonDownloadFinalization(parent, v.Item.ID); err != nil {
					return nil, err
				}
				_ = e.Discard(v.Task.Config, v.Prepared)
				continue
			}
			result, err = e.Commit(parent, v.Task.Config, v.Item, v.Prepared)
			if err != nil {
				return nil, err
			}
		} else {
			if actual, exists, e2 := e.Existing(parent, v.Task.Config, v.Item); e2 == nil && exists {
				result.MtimeMS = actual.MtimeMS
			}
			_ = e.Discard(v.Task.Config, v.Prepared)
		}
		if err = r.SettleDownloadItem(parent, v.Item, ItemSucceeded, result, nil); err != nil {
			return nil, err
		}
	}
	if err = r.RecoverDownloads(parent); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithCancel(parent)
	s := &Service{repository: r, executor: e, ctx: ctx, cancel: cancel, max: max, active: map[string]*activeTask{}, wake: make(chan struct{}, 1), dispatcher: make(chan struct{})}
	s.hub = NewHub(ctx, emit)
	go s.dispatchLoop()
	return s, nil
}
func (s *Service) BuildPlan(ctx context.Context, input PlanInput) (Plan, error) {
	if input.Config.Output.Directory == "" && s.resolveOutputDirectory != nil {
		directory, err := s.resolveOutputDirectory(ctx)
		if err != nil {
			return Plan{}, err
		}
		input.Config.Output.Directory = directory
	}
	d, err := s.repository.GetSnapshot(ctx, input.SnapshotID)
	if err != nil {
		return Plan{}, err
	}
	var raw []byte
	if input.Config.Media.Raw {
		v, err := s.repository.GetRawSnapshot(ctx, input.SnapshotID)
		if err != nil {
			return Plan{}, err
		}
		raw = []byte(v)
	}
	return BuildPlan(d, input.Config, raw)
}
func (s *Service) CreateTask(ctx context.Context, input CreateTask) (Task, error) {
	input.RequestID = strings.TrimSpace(input.RequestID)
	if input.RequestID == "" || len(input.RequestID) > 128 {
		return Task{}, errors.New("需要有效的下载请求 ID")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closing || s.ctx.Err() != nil {
		return Task{}, ErrClosing
	}
	old, err := s.repository.FindDownloadRequest(ctx, input.RequestID)
	if err == nil {
		// An omitted directory reuses the original task's resolved location,
		// including when global settings changed since the first submission.
		if input.Config.Output.Directory == "" {
			input.Config.Output.Directory = old.Config.Output.Directory
		}
		oldConfig, _ := json.Marshal(old.Config)
		newConfig, _ := json.Marshal(input.Config)
		if old.SnapshotID != input.SnapshotID || string(oldConfig) != string(newConfig) {
			return Task{}, ErrConflict
		}
		return old, nil
	}
	if !errors.Is(err, ErrNotFound) {
		return Task{}, err
	}
	p, err := s.BuildPlan(ctx, PlanInput{input.SnapshotID, input.Config})
	if err != nil {
		return Task{}, err
	}
	id := rand.Text()
	if err = s.repository.CreateDownloadTask(ctx, id, input.RequestID, p); err != nil {
		return Task{}, err
	}
	t, err := s.repository.GetDownloadTask(ctx, id)
	if err == nil {
		s.hub.Publish(t, true)
		s.signal()
	}
	return t, err
}
func (s *Service) signal() {
	select {
	case s.wake <- struct{}{}:
	default:
	}
}
func (s *Service) SetConcurrency(max int) { s.mu.Lock(); s.max = max; s.mu.Unlock(); s.signal() }
func (s *Service) dispatchLoop() {
	defer close(s.dispatcher)
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-s.ctx.Done():
			return
		case <-s.wake:
			s.dispatch()
		case <-ticker.C:
			s.dispatch()
		}
	}
}
func (s *Service) dispatch() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closing || s.ctx.Err() != nil {
		return
	}
	for len(s.active) < s.max {
		t, err := s.repository.ClaimDownloadTask(s.ctx)
		if errors.Is(err, ErrNotFound) {
			return
		}
		if err != nil {
			slog.Error("claim download task", "error", err)
			return
		}
		ctx, cancel := context.WithCancel(s.ctx)
		a := &activeTask{task: t, cancel: cancel, stop: Interrupted, done: make(chan struct{})}
		s.active[t.ID] = a
		s.workers.Add(1)
		s.hub.Publish(t, true)
		go s.execute(ctx, a)
	}
}
func (s *Service) execute(ctx context.Context, a *activeTask) {
	defer func() {
		s.mu.Lock()
		delete(s.active, a.task.ID)
		s.mu.Unlock()
		close(a.done)
		s.workers.Done()
		s.signal()
	}()
	err := s.run(ctx, a)
	if ctx.Err() != nil || err != nil {
		cleanup, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		a.mu.Lock()
		state := a.stop
		a.mu.Unlock()
		if err != nil && ctx.Err() == nil {
			slog.Error("execute download task", "task_id", a.task.ID, "error", err)
			state = Interrupted
		}
		if e := s.repository.StopDownloadTask(cleanup, a.task.ID, state); e != nil && !errors.Is(e, ErrConflict) {
			slog.Error("stop download task", "task_id", a.task.ID, "error", e)
		}
		s.publishCurrent(cleanup, a.task.ID)
	}
}
func (s *Service) run(ctx context.Context, a *activeTask) error {
	items, err := s.repository.DownloadItems(ctx, a.task.ID)
	if err != nil {
		return err
	}
	for _, item := range items {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if item.State == ItemSucceeded || item.State == ItemSkipped {
			continue
		}
		if item.State != ItemPending {
			return ErrConflict
		}
		if err = s.repository.StartDownloadItem(ctx, a.task, item); err != nil {
			return err
		}
		t, err := s.repository.GetDownloadTask(ctx, a.task.ID)
		if err != nil {
			return err
		}
		a.mu.Lock()
		a.task = t
		a.item = item
		a.item.State = ItemRunning
		a.checkpoint = time.Now()
		a.mu.Unlock()
		s.hub.Publish(t, true)
		result, skip, err := s.findExisting(ctx, a.task, item)
		if err != nil {
			return err
		}
		if skip {
			if err = s.repository.SettleDownloadItem(ctx, item, ItemSkipped, result, nil); err != nil {
				return err
			}
			s.updateActive(ctx, a)
			continue
		}
		if item.Kind == MediaManifest {
			item.Inline, err = s.manifest(ctx, a.task)
			if err != nil {
				return err
			}
			size := int64(len(item.Inline))
			item.ExpectedBytes = &size
		}
		prepared, downloadErr := s.executor.Prepare(ctx, a.task.Config, item, func(p Progress) { s.progress(ctx, a, p) }, func(attempt Attempt) {
			cleanup, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			if err := s.repository.SaveDownloadAttempt(cleanup, attempt); err != nil {
				slog.Error("save download attempt", "item_id", item.ID, "error", err)
			}
		})
		if ctx.Err() != nil {
			if prepared.TemporaryPath != "" {
				_ = s.executor.Discard(a.task.Config, prepared)
			}
			s.checkpoint(a)
			return ctx.Err()
		}
		s.checkpoint(a)
		if downloadErr != nil {
			failure := asFailure(downloadErr)
			if err = s.repository.SettleDownloadItem(ctx, item, ItemFailed, Result{}, failure); err != nil {
				return err
			}
			s.updateActive(ctx, a)
			if !a.task.Config.Execution.ContinueOnError {
				break
			}
			continue
		}
		// Finalization completes under its own short deadline. Pause/cancel waits
		// for this worker and retains any file already committed successfully.
		cleanup, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		if err = s.repository.FinalizeDownloadItem(cleanup, item.ID, prepared); err != nil {
			cancel()
			_ = s.executor.Discard(a.task.Config, prepared)
			return err
		}
		result, err = s.executor.Commit(cleanup, a.task.Config, item, prepared)
		commitFailed := err != nil
		if err != nil {
			_ = s.executor.Discard(a.task.Config, prepared)
			err = s.repository.SettleDownloadItem(cleanup, item, ItemFailed, Result{}, asFailure(err))
		} else {
			err = s.repository.SettleDownloadItem(cleanup, item, ItemSucceeded, result, nil)
		}
		cancel()
		if err != nil {
			return err
		}
		s.updateActive(ctx, a)
		if commitFailed && !a.task.Config.Execution.ContinueOnError {
			break
		}
	}
	if ctx.Err() != nil {
		return ctx.Err()
	}
	t, err := s.repository.GetDownloadTask(ctx, a.task.ID)
	if err != nil {
		return err
	}
	state := Succeeded
	if t.SuccessfulItems+t.SkippedItems < t.PlannedItems || t.FailedItems > 0 {
		state = Failed
		if t.SuccessfulItems > 0 || t.FulfilledItems > 0 {
			state = Partial
		}
	}
	if err = s.repository.FinishDownloadTask(ctx, t.ID, state, nil); err != nil {
		return err
	}
	s.publishCurrent(ctx, t.ID)
	return nil
}
func asFailure(err error) *Failure {
	var f *Failure
	if errors.As(err, &f) {
		return f
	}
	return &Failure{Kind: ErrorNetwork, Message: "下载失败，请重试", Retryable: true}
}
func (s *Service) findExisting(ctx context.Context, t Task, i Item) (Result, bool, error) {
	if i.Kind != MediaManifest && t.Config.Dedup.Mode == SameOutput && !t.Config.Dedup.Force {
		files, err := s.repository.CoveredDownloadFiles(ctx, t, i)
		if err != nil {
			return Result{}, false, err
		}
		for _, file := range files {
			if s.executor.Verify(ctx, file.Result, t.Config.Dedup.StrictHash) {
				result := file.Result
				result.SkipReason = SkipHistory
				result.ReusedItemID = file.ID
				return result, true, nil
			}
		}
	}
	if t.Config.Output.ExistingPolicy == SkipExisting {
		return s.executor.Existing(ctx, t.Config, i)
	}
	return Result{}, false, nil
}
func (s *Service) progress(ctx context.Context, a *activeTask, p Progress) {
	a.mu.Lock()
	a.item.CurrentBytes = p.CurrentBytes
	a.item.CurrentTotal = p.Total
	if a.item.Kind <= MediaMotion {
		a.item.TransferredBytes += p.Delta
	}
	a.task.CurrentBytes = p.CurrentBytes
	a.task.CurrentTotal = p.Total
	if a.item.Kind <= MediaMotion {
		a.task.TransferredBytes += p.Delta
	}
	a.task.UpdatedAtMS = time.Now().UnixMilli()
	task := a.task
	write := time.Since(a.checkpoint) >= time.Second
	if write {
		a.checkpoint = time.Now()
	}
	a.mu.Unlock()
	s.hub.Publish(task, false)
	if write {
		s.checkpoint(a)
	}
}
func (s *Service) checkpoint(a *activeTask) {
	a.mu.Lock()
	task, item := a.task, a.item
	a.mu.Unlock()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := s.repository.CheckpointDownload(ctx, task, item); err != nil {
		slog.Error("checkpoint download", "task_id", task.ID, "error", err)
	}
}
func (s *Service) updateActive(ctx context.Context, a *activeTask) {
	t, err := s.repository.GetDownloadTask(ctx, a.task.ID)
	if err != nil {
		return
	}
	a.mu.Lock()
	a.task = t
	a.mu.Unlock()
	s.hub.Publish(t, true)
}
func (s *Service) publishCurrent(ctx context.Context, id string) {
	if t, err := s.repository.GetDownloadTask(ctx, id); err == nil {
		s.hub.Publish(t, true)
	}
}
func (s *Service) manifest(ctx context.Context, t Task) ([]byte, error) {
	items, err := s.repository.DownloadItems(ctx, t.ID)
	if err != nil {
		return nil, err
	}
	type entry struct {
		Sequence       int            `json:"sequence"`
		Kind           MediaKind      `json:"kind"`
		Representation Representation `json:"representation"`
		State          ItemState      `json:"state"`
		Result         Result         `json:"result"`
		Failure        *Failure       `json:"failure"`
	}
	files := []entry{}
	for _, i := range items {
		if i.Kind == MediaManifest {
			continue
		}
		files = append(files, entry{i.Sequence, i.Kind, i.Representation, i.State, i.Result, i.Failure})
	}
	return json.MarshalIndent(struct {
		SchemaVersion int     `json:"schema_version"`
		TaskID        string  `json:"task_id"`
		NoteID        string  `json:"note_id"`
		SnapshotID    string  `json:"snapshot_id"`
		Title         string  `json:"title"`
		AuthorID      string  `json:"author_id"`
		Files         []entry `json:"files"`
	}{1, t.ID, t.NoteID, t.SnapshotID, t.Title, t.AuthorID, files}, "", "  ")
}
func (s *Service) GetTask(ctx context.Context, id string) (Task, error) {
	t, err := s.repository.GetDownloadTask(ctx, id)
	if err != nil {
		return t, err
	}
	s.mu.Lock()
	a := s.active[id]
	s.mu.Unlock()
	if a != nil {
		a.mu.Lock()
		if a.task.Revision >= t.Revision {
			t = a.task
		}
		a.mu.Unlock()
	}
	return t, nil
}
func (s *Service) Items(ctx context.Context, id string) ([]Item, error) {
	return s.repository.DownloadItems(ctx, id)
}
func (s *Service) List(ctx context.Context, input ListInput, history bool) (Page, error) {
	if input.Limit == 0 {
		input.Limit = 50
	}
	if input.Limit < 1 || input.Limit > 200 || input.BeforeAtMS < 0 || (input.BeforeAtMS == 0) != (input.BeforeID == "") || input.State < 0 || input.State > Interrupted {
		return Page{}, errors.New("无效的下载查询参数")
	}
	return s.repository.ListDownloadTasks(ctx, input, history)
}
func (s *Service) Stop(ctx context.Context, id string, state State) (Task, error) {
	if state != Paused && state != Canceled {
		return Task{}, ErrConflict
	}
	s.mu.Lock()
	a := s.active[id]
	if a != nil {
		a.mu.Lock()
		a.stop = state
		a.cancel()
		a.mu.Unlock()
		s.mu.Unlock()
		select {
		case <-ctx.Done():
			return Task{}, ctx.Err()
		case <-a.done:
		}
		return s.GetTask(ctx, id)
	}
	err := s.repository.StopDownloadTask(ctx, id, state)
	s.mu.Unlock()
	if err != nil {
		return Task{}, err
	}
	s.publishCurrent(ctx, id)
	s.signal()
	return s.GetTask(ctx, id)
}
func (s *Service) Resume(ctx context.Context, id string) (Task, error) {
	s.mu.Lock()
	if s.closing || s.ctx.Err() != nil {
		s.mu.Unlock()
		return Task{}, ErrClosing
	}
	items, e := s.repository.DownloadItems(ctx, id)
	if e != nil {
		s.mu.Unlock()
		return Task{}, e
	}
	for _, item := range items {
		if item.State == ItemFinalizing {
			s.mu.Unlock()
			return Task{}, errors.New("存在未完成文件提交，请重启应用核对后再恢复")
		}
	}
	err := s.repository.ResumeDownloadTask(ctx, id)
	s.mu.Unlock()
	if err != nil {
		return Task{}, err
	}
	s.publishCurrent(ctx, id)
	s.signal()
	return s.GetTask(ctx, id)
}
func (s *Service) Active(ctx context.Context) (ActiveSnapshot, error) {
	run, seq := s.hub.Checkpoint()
	tasks, err := s.repository.ActiveDownloadTasks(ctx)
	if err != nil {
		return ActiveSnapshot{}, err
	}
	s.mu.Lock()
	for i, t := range tasks {
		if a := s.active[t.ID]; a != nil {
			a.mu.Lock()
			if a.task.Revision >= t.Revision {
				tasks[i] = a.task
			}
			a.mu.Unlock()
		}
	}
	s.mu.Unlock()
	return ActiveSnapshot{run, seq, tasks}, nil
}
func (s *Service) Changes(input ChangesInput) Changes { return s.hub.Since(input) }
func (s *Service) Close() error {
	s.once.Do(func() {
		s.mu.Lock()
		s.closing = true
		s.cancel()
		s.mu.Unlock()
		<-s.dispatcher
		s.workers.Wait()
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		s.closeErr = errors.Join(s.repository.RecoverDownloads(ctx), s.executor.Close())
		s.hub.Close()
	})
	return s.closeErr
}
