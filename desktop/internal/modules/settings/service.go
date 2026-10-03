package settings

import (
	"context"
	"time"
)

type Repository interface {
	LoadGeneral(context.Context) (General, error)
	SaveGeneral(context.Context, General, int64) error
}

type Service struct {
	repository Repository
	clock      func() time.Time
	writeSlot  chan struct{}
}

func NewService(repository Repository, clock func() time.Time) *Service {
	if clock == nil {
		clock = time.Now
	}
	return &Service{repository: repository, clock: clock, writeSlot: make(chan struct{}, 1)}
}

func (s *Service) Get(ctx context.Context) (General, error) {
	g, err := s.repository.LoadGeneral(ctx)
	if err != nil {
		return General{}, err
	}
	return g, g.Validate()
}

func (s *Service) Initialize(ctx context.Context) error {
	if err := s.acquireWrite(ctx); err != nil {
		return err
	}
	defer s.releaseWrite()
	_, err := s.Get(ctx)
	if err == nil {
		return nil
	}
	if err != ErrNotFound {
		return err
	}
	g := Defaults()
	g.Revision, g.UpdatedAtMS = 1, s.clock().UnixMilli()
	return s.repository.SaveGeneral(ctx, g, 0)
}

func (s *Service) Update(ctx context.Context, input UpdateGeneral) (General, error) {
	if err := s.acquireWrite(ctx); err != nil {
		return General{}, err
	}
	defer s.releaseWrite()
	current, err := s.Get(ctx)
	if err != nil {
		return General{}, err
	}
	if input.ExpectedRevision != current.Revision {
		return General{}, ErrConflict
	}
	next := General{
		SchemaVersion: 1, ThemeMode: input.ThemeMode,
		MaxConcurrentNotes: input.MaxConcurrentNotes, OutputDirectory: input.OutputDirectory,
		Revision: current.Revision + 1, UpdatedAtMS: s.clock().UnixMilli(),
	}
	if err = next.Validate(); err != nil {
		return General{}, err
	}
	if err = s.repository.SaveGeneral(ctx, next, current.Revision); err != nil {
		return General{}, err
	}
	return next, nil
}

func (s *Service) acquireWrite(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	select {
	case s.writeSlot <- struct{}{}:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (s *Service) releaseWrite() { <-s.writeSlot }
