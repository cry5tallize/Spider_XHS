package parsing

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/accounts"
	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/notes"
)

type activeJob struct {
	cancel context.CancelFunc
	done   chan struct{}
}
type Service struct {
	mu         sync.Mutex
	repository Repository
	accounts   AccountSource
	secrets    Secrets
	fetcher    Fetcher
	ctx        context.Context
	cancel     context.CancelFunc
	wake       chan struct{}
	dispatcher chan struct{}
	active     map[string]*activeJob
	workers    sync.WaitGroup
	closing    bool
	once       sync.Once
	closeErr   error
}

func NewService(parent context.Context, r Repository, a AccountSource, secrets Secrets, f Fetcher) (*Service, error) {
	if err := r.RecoverParseGroups(parent); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithCancel(parent)
	s := &Service{repository: r, accounts: a, secrets: secrets, fetcher: f, ctx: ctx, cancel: cancel, wake: make(chan struct{}, 1), dispatcher: make(chan struct{}), active: map[string]*activeJob{}}
	go s.loop()
	return s, nil
}
func (s *Service) Start(ctx context.Context, input Start) (Job, error) {
	input.RequestID = strings.TrimSpace(input.RequestID)
	if input.RequestID == "" || len(input.RequestID) > 128 {
		return Job{}, errors.New("请求 ID 无效")
	}
	if input.Mode != ModeNotes && input.Mode != ModeUsers {
		return Job{}, errors.New("解析模式无效")
	}
	if err := input.Config.Validate(); err != nil {
		return Job{}, err
	}
	inputs, err := ExtractInputs(input.Text)
	if err != nil {
		return Job{}, err
	}
	encoded, _ := json.Marshal(input)
	sum := sha256.Sum256(encoded)
	fingerprint := hex.EncodeToString(sum[:])
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closing || s.ctx.Err() != nil {
		return Job{}, notes.ErrClosing
	}
	old, oldHash, err := s.repository.FindParseGroupRequest(ctx, input.RequestID)
	if err == nil {
		if oldHash != fingerprint {
			return Job{}, ErrConflict
		}
		return old, nil
	}
	if !errors.Is(err, ErrNotFound) {
		return Job{}, err
	}
	available, err := s.accounts.List(ctx)
	if err != nil {
		return Job{}, err
	}
	pool := []accounts.Account{}
	var fixed accounts.Account
	for _, a := range available {
		if !a.Enabled || !a.HasCookie {
			continue
		}
		if a.ID == input.AccountID || (input.AccountID == "" && a.IsDefault) {
			fixed = a
		}
		if len(input.Config.AccountIDs) == 0 || contains(input.Config.AccountIDs, a.ID) {
			pool = append(pool, a)
		}
	}
	if input.Config.AccountMode == AccountFixed {
		if fixed.ID == "" {
			return Job{}, errors.New("请选择已启用的解析账号")
		}
		pool = []accounts.Account{fixed}
	}
	if len(pool) == 0 {
		return Job{}, errors.New("没有可用解析账号")
	}
	at := time.Now().UnixMilli()
	j := Job{ID: rand.Text(), Mode: input.Mode, State: Queued, Config: input.Config, CreatedAtMS: at, UpdatedAtMS: at, Revision: 1}
	sources := make([]Source, 0, len(inputs))
	for index, text := range inputs {
		a := pool[index%len(pool)]
		v := Source{ID: rand.Text(), JobID: j.ID, Index: index + 1, AccountID: a.ID, CredentialVersion: a.CredentialVersion, State: SourcePending, HasMore: true, Provider: s.secrets.Provider()}
		if len(text) > 8192 || !IsAllowedInput(text) {
			v.State = SourceFailed
			v.Failure = &notes.Failure{Kind: notes.ErrorResponse, Message: "输入不是有效的小红书链接或 ID"}
			text = ""
		}
		body, _ := json.Marshal(SourceInput{URL: text})
		v.InputBlob, err = s.secrets.Protect(body, "parse-source/"+v.ID)
		if err != nil {
			return Job{}, errors.New("无法保护解析输入，未创建作业")
		}
		sources = append(sources, v)
	}
	if err = s.repository.CreateParseGroup(ctx, j, input.RequestID, fingerprint, sources); err != nil {
		return Job{}, err
	}
	s.signal()
	return s.repository.GetParseGroup(ctx, j.ID)
}
func contains(values []string, value string) bool {
	for _, v := range values {
		if v == value {
			return true
		}
	}
	return false
}
func (s *Service) signal() {
	select {
	case s.wake <- struct{}{}:
	default:
	}
}
func (s *Service) loop() {
	defer close(s.dispatcher)
	timer := time.NewTicker(time.Second)
	defer timer.Stop()
	for {
		select {
		case <-s.ctx.Done():
			return
		case <-s.wake:
			s.dispatch()
		case <-timer.C:
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
	for len(s.active) < 2 {
		j, err := s.repository.ClaimParseGroup(s.ctx)
		if errors.Is(err, ErrNotFound) {
			return
		}
		if err != nil {
			slog.Error("claim parse collection", "error", err)
			return
		}
		ctx, cancel := context.WithCancel(s.ctx)
		a := &activeJob{cancel: cancel, done: make(chan struct{})}
		s.active[j.ID] = a
		s.workers.Add(1)
		go s.execute(ctx, j, a)
	}
}
func (s *Service) execute(ctx context.Context, j Job, a *activeJob) {
	defer func() {
		a.cancel()
		s.mu.Lock()
		delete(s.active, j.ID)
		s.mu.Unlock()
		close(a.done)
		s.workers.Done()
		s.signal()
	}()
	err := s.run(ctx, j)
	if err == nil {
		return
	}
	if errors.Is(err, ErrConflict) {
		return
	}
	cleanup, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	state := Paused
	if s.ctx.Err() != nil {
		state = Interrupted
	}
	failure := asFailure(err)
	if ctx.Err() != nil {
		failure = nil
	}
	if e := s.repository.StopParseGroup(cleanup, j.ID, state, failure); e != nil && !errors.Is(e, ErrConflict) {
		slog.Error("stop parse collection", "job_id", j.ID, "error", e)
	}
}
func (s *Service) checkAccount(ctx context.Context, id string, version int64) error {
	a, err := s.accounts.SessionAccount(ctx, id)
	if err != nil || !a.Enabled || a.CredentialVersion != version {
		return &notes.Failure{Kind: notes.ErrorAccount, Message: "账号配置已变化，请创建新的解析作业"}
	}
	return nil
}
func (s *Service) Get(ctx context.Context, id string) (Job, error) {
	return s.repository.GetParseGroup(ctx, id)
}
func (s *Service) List(ctx context.Context) ([]Job, error) { return s.repository.ListParseGroups(ctx) }
func (s *Service) Sources(ctx context.Context, id string) ([]Source, error) {
	return s.repository.ParseGroupSources(ctx, id)
}
func (s *Service) Items(ctx context.Context, q ItemQuery) (ItemPage, error) {
	if q.Limit == 0 {
		q.Limit = 50
	}
	if q.Limit < 1 || q.Limit > 200 || q.AfterOrdinal < 0 || q.State < 0 || q.State > ItemCanceled {
		return ItemPage{}, errors.New("解析结果分页参数无效")
	}
	return s.repository.ListParseItems(ctx, q)
}
func (s *Service) Origins(ctx context.Context, id string) ([]Origin, error) {
	return s.repository.ParseItemOrigins(ctx, id)
}
func (s *Service) Stop(ctx context.Context, id string, state State) (Job, error) {
	if state != Paused && state != Canceled {
		return Job{}, ErrConflict
	}
	s.mu.Lock()
	if s.closing {
		s.mu.Unlock()
		return Job{}, notes.ErrClosing
	}
	// Commit state first, so a late source or snapshot transaction cannot win.
	err := s.repository.StopParseGroup(ctx, id, state, nil)
	a := s.active[id]
	if a != nil {
		a.cancel()
	}
	s.mu.Unlock()
	if err != nil {
		return Job{}, err
	}
	if a != nil {
		select {
		case <-ctx.Done():
			return Job{}, ctx.Err()
		case <-a.done:
		}
	}
	s.signal()
	return s.repository.GetParseGroup(ctx, id)
}
func (s *Service) Resume(ctx context.Context, id string, retry bool) (Job, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closing || s.ctx.Err() != nil {
		return Job{}, notes.ErrClosing
	}
	j, err := s.repository.GetParseGroup(ctx, id)
	if err != nil {
		return Job{}, err
	}
	if j.State == Limited {
		return Job{}, errors.New("已达配置上限，请扩大范围后新建作业")
	}
	sources, err := s.repository.ParseGroupSources(ctx, id)
	if err != nil {
		return Job{}, err
	}
	for _, source := range sources {
		if err = s.checkAccount(ctx, source.AccountID, source.CredentialVersion); err != nil {
			return Job{}, err
		}
	}
	if err = s.repository.ResumeParseGroup(ctx, id, retry); err != nil {
		return Job{}, err
	}
	s.signal()
	return s.repository.GetParseGroup(ctx, id)
}
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
		s.closeErr = s.repository.RecoverParseGroups(ctx)
	})
	return s.closeErr
}
func asFailure(err error) *notes.Failure {
	var f *notes.Failure
	if errors.As(err, &f) {
		return f
	}
	if errors.Is(err, accounts.ErrChanged) {
		return &notes.Failure{Kind: notes.ErrorAccount, Message: "账号凭据已更新，请创建新的作业"}
	}
	return &notes.Failure{Kind: notes.ErrorResponse, Message: "解析或分页失败，请查看来源和结果后重试", Retryable: true}
}
func fatal(err error) bool {
	f := asFailure(err)
	return f.Kind == notes.ErrorAccount || f.Kind == notes.ErrorUnauthorized || f.Kind == notes.ErrorRestricted || f.Kind == notes.ErrorRateLimited || f.Kind == notes.ErrorStorage
}
