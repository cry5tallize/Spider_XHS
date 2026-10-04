package notes

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/accounts"
	"github.com/cry5tallize/xhs_spider_desktop/internal/xhsapi"
)

type Repository interface {
	CreateParseJob(context.Context, ParseJob) error
	GetParseJob(context.Context, string) (ParseJob, error)
	FindParseRequest(context.Context, string) (ParseJob, error)
	ListParseJobs(context.Context) ([]ParseJob, error)
	StartParseJob(context.Context, string, int64) error
	FinishParseJob(context.Context, string, ParseState, *Failure, int64) error
	InterruptParseJobs(context.Context, int64) error
	SaveNoteSnapshot(context.Context, string, Detail, Payload) error
	ListNotes(context.Context, ListInput) (Page, error)
	GetNote(context.Context, string) (Detail, error)
	GetSnapshot(context.Context, string) (Detail, error)
	ListSnapshots(context.Context, string) ([]Snapshot, error)
	GetRawSnapshot(context.Context, string) (string, error)
}
type AccountSource interface {
	List(context.Context) ([]accounts.Account, error)
}
type Fetcher interface {
	FetchNote(context.Context, string, xhsapi.NoteRef) (Payload, error)
}
type work struct {
	id, account string
	ref         xhsapi.NoteRef
}

type Service struct {
	repository Repository
	accounts   AccountSource
	fetcher    Fetcher
	ctx        context.Context
	cancel     context.CancelFunc
	mu         sync.Mutex
	queue      chan work
	active     map[string]context.CancelFunc
	closing    bool
	workers    sync.WaitGroup
	closeOnce  sync.Once
	closeErr   error
}

func NewService(parent context.Context, repository Repository, accounts AccountSource, fetcher Fetcher) (*Service, error) {
	if err := repository.InterruptParseJobs(parent, time.Now().UnixMilli()); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithCancel(parent)
	s := &Service{repository: repository, accounts: accounts, fetcher: fetcher, ctx: ctx, cancel: cancel,
		queue: make(chan work, 32), active: make(map[string]context.CancelFunc)}
	for i := 0; i < 2; i++ {
		s.workers.Add(1)
		go s.worker()
	}
	return s, nil
}

func (s *Service) StartParse(ctx context.Context, input StartParse) (ParseJob, error) {
	input.Input, input.RequestID = strings.TrimSpace(input.Input), strings.TrimSpace(input.RequestID)
	if input.RequestID == "" || len(input.RequestID) > 128 {
		return ParseJob{}, errors.New("需要有效的请求 ID")
	}
	if len(input.Input) > 8192 {
		return ParseJob{}, errors.New("笔记链接过长")
	}
	ref, err := xhsapi.ParseNoteURL(input.Input)
	if err != nil {
		return ParseJob{}, errors.New("请输入完整的小红书笔记链接或 24 位笔记 ID；短链接将在批量解析阶段支持")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closing || s.ctx.Err() != nil {
		return ParseJob{}, ErrClosing
	}
	old, err := s.repository.FindParseRequest(ctx, input.RequestID)
	if err == nil {
		if old.NoteID != ref.ID || (input.AccountID != "" && old.AccountID != input.AccountID) {
			return ParseJob{}, ErrConflict
		}
		return old, nil
	}
	if !errors.Is(err, ErrNotFound) {
		return ParseJob{}, err
	}
	available, err := s.accounts.List(ctx)
	if err != nil {
		return ParseJob{}, err
	}
	var chosen string
	for _, a := range available {
		if a.Enabled && a.HasCookie && (a.ID == input.AccountID || (input.AccountID == "" && a.IsDefault)) {
			chosen = a.ID
			break
		}
	}
	if chosen == "" {
		return ParseJob{}, errors.New("请选择已启用且保存了 Cookie 的账号")
	}
	if len(s.queue) == cap(s.queue) {
		return ParseJob{}, ErrQueueFull
	}
	now := time.Now().UnixMilli()
	job := ParseJob{ID: rand.Text(), RequestID: input.RequestID, AccountID: chosen, NoteID: ref.ID, State: ParseQueued, CreatedAtMS: now, UpdatedAtMS: now, Revision: 1}
	if err = s.repository.CreateParseJob(ctx, job); err != nil {
		return ParseJob{}, err
	}
	// The queue holds request tokens only in memory, never in logs or ordinary job DTOs.
	s.queue <- work{job.ID, chosen, ref}
	return job, nil
}

func (s *Service) worker() {
	defer s.workers.Done()
	for {
		select {
		case <-s.ctx.Done():
			return
		case w := <-s.queue:
			s.execute(w)
		}
	}
}

func (s *Service) execute(w work) {
	s.mu.Lock()
	if s.closing || s.ctx.Err() != nil {
		s.mu.Unlock()
		return
	}
	ctx, cancel := context.WithTimeout(s.ctx, 45*time.Second)
	s.active[w.id] = cancel
	s.mu.Unlock()
	defer func() { cancel(); s.mu.Lock(); delete(s.active, w.id); s.mu.Unlock() }()
	if err := s.repository.StartParseJob(ctx, w.id, time.Now().UnixMilli()); err != nil {
		if !errors.Is(err, ErrConflict) && s.ctx.Err() == nil {
			s.failJob(w.id, &Failure{Kind: ErrorStorage, Message: "解析状态保存失败，请检查数据目录"})
		}
		return
	}
	payload, err := s.fetcher.FetchNote(ctx, w.account, w.ref)
	if err == nil && ctx.Err() == nil {
		_, err = s.save(ctx, w.id, payload)
		if err == nil {
			return
		}
	}
	if errors.Is(err, ErrConflict) {
		return
	}
	if s.ctx.Err() != nil {
		return
	} // Close marks unfinished jobs using its cleanup context.
	failure := &Failure{Kind: ErrorNetwork, Message: "解析失败，请检查网络后重试", Retryable: true}
	var typed *Failure
	if errors.As(err, &typed) {
		failure = typed
	}
	if ctx.Err() == context.DeadlineExceeded {
		failure = &Failure{Kind: ErrorNetwork, Message: "解析超时，请重试", Retryable: true}
	}
	if err == nil && ctx.Err() != nil {
		failure = &Failure{Kind: ErrorCanceled, Message: "解析已取消"}
	}
	s.failJob(w.id, failure)
}

func (s *Service) failJob(id string, failure *Failure) {
	ctx, cancel := context.WithTimeout(s.ctx, 5*time.Second)
	defer cancel()
	if err := s.repository.FinishParseJob(ctx, id, ParseFailed, failure, time.Now().UnixMilli()); err != nil && !errors.Is(err, ErrConflict) && s.ctx.Err() == nil {
		slog.Error("persist parse failure", "job_id", id, "error", err)
	}
}

func (s *Service) save(ctx context.Context, job string, p Payload) (Detail, error) {
	if p.Note.ID == "" {
		return Detail{}, &Failure{Kind: ErrorResponse, Message: "响应缺少笔记 ID"}
	}
	if p.Warnings == nil {
		p.Warnings = []string{}
	}
	hash := sha256.Sum256(p.Raw)
	d := Detail{Note: p.Note, Snapshot: Snapshot{ID: rand.Text(), NoteID: p.Note.ID, AccountID: p.AccountID, CredentialVersion: p.CredentialVersion,
		ParserVersion: 1, Warnings: p.Warnings, FetchedAtMS: time.Now().UnixMilli(), RawSHA256: hex.EncodeToString(hash[:])}}
	if err := s.repository.SaveNoteSnapshot(ctx, job, d, p); err != nil {
		if errors.Is(err, ErrConflict) {
			return Detail{}, err
		}
		if errors.Is(err, accounts.ErrChanged) || errors.Is(err, accounts.ErrNotFound) {
			return Detail{}, &Failure{Kind: ErrorAccount, Message: "账号配置已变更，请重新解析", Retryable: true}
		}
		return Detail{}, &Failure{Kind: ErrorStorage, Message: "笔记保存失败，请检查数据目录"}
	}
	return d, nil
}

// ImportPayload is used by the offline CLI through the same persistence path.
// It does not create accounts or perform any network requests.
func (s *Service) ImportPayload(ctx context.Context, p Payload) (Detail, error) {
	return s.save(ctx, "", p)
}
func (s *Service) GetParseJob(ctx context.Context, id string) (ParseJob, error) {
	return s.repository.GetParseJob(ctx, id)
}
func (s *Service) ListParseJobs(ctx context.Context) ([]ParseJob, error) {
	return s.repository.ListParseJobs(ctx)
}
func (s *Service) ListNotes(ctx context.Context, input ListInput) (Page, error) {
	if input.Limit == 0 {
		input.Limit = 50
	}
	if input.Limit < 1 || input.Limit > 200 || input.BeforeAtMS < 0 || (input.BeforeAtMS == 0) != (input.BeforeID == "") {
		return Page{}, errors.New("无效的分页参数")
	}
	return s.repository.ListNotes(ctx, input)
}
func (s *Service) GetNote(ctx context.Context, id string) (Detail, error) {
	return s.repository.GetNote(ctx, id)
}
func (s *Service) GetSnapshot(ctx context.Context, id string) (Detail, error) {
	return s.repository.GetSnapshot(ctx, id)
}
func (s *Service) ListSnapshots(ctx context.Context, id string) ([]Snapshot, error) {
	return s.repository.ListSnapshots(ctx, id)
}
func (s *Service) GetRawSnapshot(ctx context.Context, id string) (string, error) {
	return s.repository.GetRawSnapshot(ctx, id)
}
func (s *Service) CancelParse(ctx context.Context, id string) (ParseJob, error) {
	// Persist cancellation first. Completion uses a transactional state guard.
	if err := s.repository.FinishParseJob(ctx, id, ParseCanceled, nil, time.Now().UnixMilli()); err != nil {
		return ParseJob{}, err
	}
	s.mu.Lock()
	if cancel := s.active[id]; cancel != nil {
		cancel()
	}
	s.mu.Unlock()
	return s.repository.GetParseJob(ctx, id)
}
func (s *Service) Close() error {
	s.closeOnce.Do(func() {
		s.mu.Lock()
		s.closing = true
		s.cancel()
		s.mu.Unlock()
		s.workers.Wait()
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		s.closeErr = s.repository.InterruptParseJobs(ctx, time.Now().UnixMilli())
	})
	return s.closeErr
}
