package app

import (
	"context"
	"errors"
	"fmt"
	"github.com/cry5tallize/xhs_spider_desktop/internal/adapters/mediahttp"
	xhsadapter "github.com/cry5tallize/xhs_spider_desktop/internal/adapters/xhs"
	"github.com/cry5tallize/xhs_spider_desktop/internal/bridge/dto"
	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/accounts"
	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/downloads"
	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/notes"
	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/parsing"
	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/settings"
	"github.com/cry5tallize/xhs_spider_desktop/internal/platform/datalock"
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
	mu            sync.RWMutex
	profile       paths.Profile
	paths         paths.Paths
	state         dto.RuntimeState
	store         *storage.Store
	settings      *settings.Service
	accounts      *accounts.Service
	notes         *notes.Service
	sessions      *xhsadapter.Sessions
	downloads     *downloads.Service
	parsing       *parsing.Service
	collection    *xhsadapter.CollectionFetcher
	parseFetcher  parsing.Fetcher
	dataLock      *datalock.Lock
	emitDownloads func(downloads.EventBatch)
	cancel        context.CancelFunc
	ctx           context.Context
	closeErr      error
	closeOnce     sync.Once
	commands      sync.WaitGroup
}

type Option func(*Runtime)

// WithParsingFetcher supports explicitly invoked offline CLI fixtures.
func WithParsingFetcher(fetcher parsing.Fetcher) Option {
	return func(r *Runtime) { r.parseFetcher = fetcher }
}

func NewRuntime(profile paths.Profile, directory string, options ...Option) (*Runtime, error) {
	p, err := paths.Resolve(profile, directory)
	if err != nil {
		return nil, err
	}
	r := &Runtime{profile: profile, paths: p, state: dto.StateUnknown}
	for _, option := range options {
		option(r)
	}
	return r, nil
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
	lock, err := datalock.Acquire(r.paths.DataDirectory)
	if err != nil {
		cancel()
		r.state = dto.StateFailed
		return err
	}
	r.dataLock = lock
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
	probe := &xhsadapter.AccountProbe{}
	protector := secrets.New()
	r.accounts = accounts.NewService(store, protector, probe)
	r.sessions = xhsadapter.NewSessions(ctx, r.accounts)
	probe.Sessions = r.sessions
	r.accounts.SetInvalidator(r.sessions.Invalidate)
	r.notes, err = notes.NewService(ctx, store, r.accounts, xhsadapter.NoteFetcher{Sessions: r.sessions})
	if err != nil {
		cancel()
		r.state = dto.StateFailed
		return errors.Join(fmt.Errorf("initialize note parsing: %w", err), r.sessions.Close(), store.Close())
	}
	general, err := service.Get(ctx)
	if err != nil {
		cancel()
		r.state = dto.StateFailed
		return errors.Join(err, r.notes.Close(), r.sessions.Close(), store.Close())
	}
	r.collection = xhsadapter.NewCollectionFetcher(r.sessions)
	fetcher := r.parseFetcher
	if fetcher == nil {
		fetcher = r.collection
	}
	r.parsing, err = parsing.NewService(ctx, store, r.accounts, protector, fetcher)
	if err != nil {
		cancel()
		r.state = dto.StateFailed
		return errors.Join(err, r.collection.Close(), r.notes.Close(), r.sessions.Close(), store.Close())
	}
	executor := mediahttp.New()
	r.downloads, err = downloads.NewService(ctx, store, executor, general.MaxConcurrentNotes, r.emitDownloads)
	if err != nil {
		cancel()
		r.state = dto.StateFailed
		return errors.Join(err, executor.Close(), r.parsing.Close(), r.collection.Close(), r.notes.Close(), r.sessions.Close(), store.Close())
	}
	r.downloads.SetOutputDirectoryResolver(r.resolveOutputDirectory)
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
		if r.downloads != nil {
			r.closeErr = errors.Join(r.closeErr, r.downloads.Close())
		}
		if r.parsing != nil {
			r.closeErr = errors.Join(r.closeErr, r.parsing.Close())
		}
		if r.collection != nil {
			r.closeErr = errors.Join(r.closeErr, r.collection.Close())
		}
		if r.notes != nil {
			r.closeErr = errors.Join(r.closeErr, r.notes.Close())
		}
		if r.sessions != nil {
			r.closeErr = errors.Join(r.closeErr, r.sessions.Close())
		}
		if r.store != nil {
			r.closeErr = errors.Join(r.closeErr, r.store.Close())
		}
		if r.dataLock != nil {
			r.closeErr = errors.Join(r.closeErr, r.dataLock.Close())
			r.dataLock = nil
		}
		r.mu.Lock()
		r.settings, r.accounts, r.notes, r.sessions, r.state = nil, nil, nil, nil, dto.StateClosed
		r.downloads = nil
		r.parsing = nil
		r.collection = nil
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

func (r *Runtime) resolveOutputDirectory(ctx context.Context) (string, error) {
	g, err := r.settings.Get(ctx)
	if err != nil {
		return "", err
	}
	if g.OutputDirectory != "" {
		return g.OutputDirectory, nil
	}
	return r.paths.DownloadDirectory, nil
}

func (r *Runtime) GetDownloadDefaults(caller context.Context) (downloads.Config, error) {
	ctx, done, err := r.beginCommand(caller)
	if err != nil {
		return downloads.Config{}, err
	}
	defer done()
	directory, err := r.resolveOutputDirectory(ctx)
	if err != nil {
		return downloads.Config{}, err
	}
	return downloads.Defaults(directory), nil
}

func (r *Runtime) WithAccounts(caller context.Context, call func(context.Context, *accounts.Service) error) error {
	ctx, done, err := r.beginCommand(caller)
	if err != nil {
		return err
	}
	defer done()
	return call(ctx, r.accounts)
}

func (r *Runtime) WithNotes(caller context.Context, call func(context.Context, *notes.Service) error) error {
	ctx, done, err := r.beginCommand(caller)
	if err != nil {
		return err
	}
	defer done()
	return call(ctx, r.notes)
}

func (r *Runtime) WithParsing(caller context.Context, call func(context.Context, *parsing.Service) error) error {
	ctx, done, err := r.beginCommand(caller)
	if err != nil {
		return err
	}
	defer done()
	return call(ctx, r.parsing)
}

// SetDownloadEmitter is wired before Start; CLI runtimes leave it nil.
func (r *Runtime) SetDownloadEmitter(emit func(downloads.EventBatch)) { r.emitDownloads = emit }
func (r *Runtime) WithDownloads(caller context.Context, call func(context.Context, *downloads.Service) error) error {
	ctx, done, err := r.beginCommand(caller)
	if err != nil {
		return err
	}
	defer done()
	return call(ctx, r.downloads)
}

func (r *Runtime) UpdateGeneral(caller context.Context, input settings.UpdateGeneral) (settings.General, error) {
	ctx, done, err := r.beginCommand(caller)
	if err != nil {
		return settings.General{}, err
	}
	defer done()
	result, err := r.settings.Update(ctx, input)
	if err == nil {
		r.downloads.SetConcurrency(result.MaxConcurrentNotes)
	}
	return result, err
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
		DataDirectory: r.paths.DataDirectory, DefaultDownloadDirectory: r.paths.DownloadDirectory, SchemaVersion: r.store.SchemaVersion(), Settings: g}, nil
}
