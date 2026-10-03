package app

import (
	"context"
	"errors"
	"fmt"
	xhsadapter "github.com/cry5tallize/xhs_spider_desktop/internal/adapters/xhs"
	"github.com/cry5tallize/xhs_spider_desktop/internal/bridge/dto"
	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/accounts"
	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/settings"
	"github.com/cry5tallize/xhs_spider_desktop/internal/platform/paths"
	"github.com/cry5tallize/xhs_spider_desktop/internal/platform/secrets"
	"github.com/cry5tallize/xhs_spider_desktop/internal/storage"
	"sync"
	"time"
)

const (
	Name       = "XHS Desktop"
	Version    = "0.1.0"
	Identifier = "com.cry5tallize.xhsspiderdesktop"
)

var ErrNotReady = errors.New("application is not ready or is closing")

type Runtime struct {
	mu        sync.RWMutex
	profile   paths.Profile
	paths     paths.Paths
	state     dto.RuntimeState
	store     *storage.Store
	settings  *settings.Service
	accounts  *accounts.Service
	cancel    context.CancelFunc
	ctx       context.Context
	closeErr  error
	closeOnce sync.Once
	commands  sync.WaitGroup
}

func NewRuntime(profile paths.Profile, directory string) (*Runtime, error) {
	p, err := paths.Resolve(profile, directory)
	if err != nil {
		return nil, err
	}
	return &Runtime{profile: profile, paths: p, state: dto.StateUnknown}, nil
}

func (r *Runtime) Start(parent context.Context) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.state == dto.StateReady {
		return nil
	}
	if r.state != dto.StateUnknown {
		return ErrNotReady
	}
	r.state = dto.StateStarting
	ctx, cancel := context.WithCancel(parent)
	r.cancel = cancel
	r.ctx = ctx
	store, err := storage.Open(ctx, r.paths.DatabasePath)
	if err != nil {
		cancel()
		r.state = dto.StateFailed
		return fmt.Errorf("initialize application database: %w", err)
	}
	service := settings.NewService(store, time.Now)
	if err = service.Initialize(ctx); err != nil {
		cancel()
		r.state = dto.StateFailed
		return errors.Join(fmt.Errorf("initialize settings: %w", err), store.Close())
	}
	r.accounts = accounts.NewService(store, secrets.New(), xhsadapter.AccountProbe{})
	r.store, r.settings, r.state = store, service, dto.StateReady
	return nil
}

func (r *Runtime) Close() error {
	r.closeOnce.Do(func() {
		r.mu.Lock()
		r.state = dto.StateClosing
		if r.cancel != nil {
			r.cancel()
		}
		r.mu.Unlock()
		// No new command can Add after closing. Even Wails' detached incoming
		// contexts are canceled before waiting, so no DB call outlives Close.
		r.commands.Wait()
		if r.store != nil {
			r.closeErr = r.store.Close()
		}
		r.mu.Lock()
		r.settings, r.accounts, r.state = nil, nil, dto.StateClosed
		r.mu.Unlock()
	})
	return r.closeErr
}

func (r *Runtime) beginCommand(caller context.Context) (context.Context, func(), error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if r.state != dto.StateReady || r.ctx.Err() != nil {
		return nil, nil, ErrNotReady
	}
	r.commands.Add(1)
	ctx, cancel := context.WithCancel(caller)
	stop := context.AfterFunc(r.ctx, cancel)
	return ctx, func() { stop(); cancel(); r.commands.Done() }, nil
}

func (r *Runtime) GetGeneral(caller context.Context) (settings.General, error) {
	ctx, done, err := r.beginCommand(caller)
	if err != nil {
		return settings.General{}, err
	}
	defer done()
	return r.settings.Get(ctx)
}

func (r *Runtime) WithAccounts(caller context.Context, call func(context.Context, *accounts.Service) error) error {
	ctx, done, err := r.beginCommand(caller)
	if err != nil {
		return err
	}
	defer done()
	return call(ctx, r.accounts)
}

func (r *Runtime) UpdateGeneral(caller context.Context, input settings.UpdateGeneral) (settings.General, error) {
	ctx, done, err := r.beginCommand(caller)
	if err != nil {
		return settings.General{}, err
	}
	defer done()
	return r.settings.Update(ctx, input)
}

func (r *Runtime) Bootstrap(caller context.Context) (dto.Bootstrap, error) {
	ctx, done, err := r.beginCommand(caller)
	if err != nil {
		return dto.Bootstrap{}, err
	}
	defer done()
	g, err := r.settings.Get(ctx)
	if err != nil {
		return dto.Bootstrap{}, err
	}
	return dto.Bootstrap{Name: Name, Version: Version, Profile: r.profile, State: dto.StateReady,
		DataDirectory: r.paths.DataDirectory, SchemaVersion: r.store.SchemaVersion(), Settings: g}, nil
}
