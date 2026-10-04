package xhs

import (
	"context"
	"errors"
	"sync"

	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/accounts"
	"github.com/cry5tallize/xhs_spider_desktop/internal/xhsapi"
)

type CookieSource interface {
	SessionAccount(context.Context, string) (accounts.Account, error)
	ReadCookie(context.Context, string) (string, int64, error)
}
type sessionEntry struct {
	client  *xhsapi.Client
	version int64
	ctx     context.Context
	cancel  context.CancelCauseFunc
	refs    int
	retired bool
}

// Sessions owns cached clients. Retirement cancels requests immediately but
// closes the transport only after its last lease is released.
type Sessions struct {
	mu        sync.Mutex
	ctx       context.Context
	source    CookieSource
	entries   map[string]*sessionEntry
	leases    sync.WaitGroup
	closed    bool
	closeErr  error
	closeOnce sync.Once
	newClient func(string) (*xhsapi.Client, error)
}
type Lease struct {
	Client  *xhsapi.Client
	Context context.Context
	Version int64
	release func()
	once    sync.Once
}

func (l *Lease) Release() { l.once.Do(l.release) }
func NewSessions(ctx context.Context, source CookieSource) *Sessions {
	return &Sessions{ctx: ctx, source: source, entries: make(map[string]*sessionEntry), newClient: func(cookie string) (*xhsapi.Client, error) { return xhsapi.NewClient(cookie, xhsapi.Options{}) }}
}
func (s *Sessions) retire(e *sessionEntry, cause error) {
	if e.retired {
		return
	}
	e.retired = true
	e.cancel(cause)
	if e.refs == 0 {
		s.closeErr = errors.Join(s.closeErr, e.client.Close())
	}
}
func (s *Sessions) Invalidate(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if e := s.entries[id]; e != nil {
		delete(s.entries, id)
		s.retire(e, accounts.ErrChanged)
	}
}
func (s *Sessions) Acquire(caller context.Context, id string) (*Lease, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed || s.ctx.Err() != nil {
		return nil, errors.New("账号会话管理器已关闭")
	}
	if err := caller.Err(); err != nil {
		return nil, err
	}
	// Read under the cache lock so a concurrent post-commit invalidation cannot
	// miss a client being created from an older credential version.
	a, err := s.source.SessionAccount(caller, id)
	if err != nil {
		return nil, err
	}
	if !a.Enabled || !a.HasCookie {
		return nil, accounts.ErrDisabled
	}
	e := s.entries[id]
	if e != nil && e.version != a.CredentialVersion {
		delete(s.entries, id)
		s.retire(e, accounts.ErrChanged)
		e = nil
	}
	if e == nil {
		cookie, version, err := s.source.ReadCookie(caller, id)
		if err != nil {
			return nil, err
		}
		client, err := s.newClient(cookie)
		if err != nil {
			return nil, errors.New("无法创建账号会话，请更新 Cookie")
		}
		ctx, cancel := context.WithCancelCause(s.ctx)
		e = &sessionEntry{client: client, version: version, ctx: ctx, cancel: cancel}
		s.entries[id] = e
	}
	e.refs++
	s.leases.Add(1)
	ctx, cancel := context.WithCancelCause(caller)
	stop := context.AfterFunc(e.ctx, func() { cancel(context.Cause(e.ctx)) })
	return &Lease{Client: e.client, Context: ctx, Version: e.version, release: func() {
		stop()
		cancel(context.Canceled)
		s.mu.Lock()
		e.refs--
		if e.retired && e.refs == 0 {
			s.closeErr = errors.Join(s.closeErr, e.client.Close())
		}
		s.mu.Unlock()
		s.leases.Done()
	}}, nil
}
func (s *Sessions) Close() error {
	s.closeOnce.Do(func() {
		s.mu.Lock()
		s.closed = true
		for id, e := range s.entries {
			delete(s.entries, id)
			s.retire(e, context.Canceled)
		}
		s.mu.Unlock()
		s.leases.Wait()
	})
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.closeErr
}
