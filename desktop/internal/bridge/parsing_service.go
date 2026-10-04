package bridge

import (
	"context"
	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/parsing"
)

type ParsingBackend interface {
	WithParsing(context.Context, func(context.Context, *parsing.Service) error) error
}
type ParsingService struct{ backend ParsingBackend }

func NewParsingService(b ParsingBackend) *ParsingService { return &ParsingService{b} }
func withParsing[T any](ctx context.Context, b ParsingBackend, call func(context.Context, *parsing.Service) (T, error)) (result T, err error) {
	err = b.WithParsing(ctx, func(ctx context.Context, s *parsing.Service) error { var e error; result, e = call(ctx, s); return e })
	return
}
func (s *ParsingService) GetDefaultConfig(ctx context.Context) (parsing.Config, error) {
	return withParsing(ctx, s.backend, func(context.Context, *parsing.Service) (parsing.Config, error) { return parsing.Defaults(), nil })
}
func (s *ParsingService) Start(ctx context.Context, i parsing.Start) (parsing.Job, error) {
	return withParsing(ctx, s.backend, func(ctx context.Context, p *parsing.Service) (parsing.Job, error) { return p.Start(ctx, i) })
}
func (s *ParsingService) List(ctx context.Context) ([]parsing.Job, error) {
	return withParsing(ctx, s.backend, func(ctx context.Context, p *parsing.Service) ([]parsing.Job, error) { return p.List(ctx) })
}
func (s *ParsingService) Get(ctx context.Context, id string) (parsing.Job, error) {
	return withParsing(ctx, s.backend, func(ctx context.Context, p *parsing.Service) (parsing.Job, error) { return p.Get(ctx, id) })
}
func (s *ParsingService) Sources(ctx context.Context, id string) ([]parsing.Source, error) {
	return withParsing(ctx, s.backend, func(ctx context.Context, p *parsing.Service) ([]parsing.Source, error) { return p.Sources(ctx, id) })
}
func (s *ParsingService) Items(ctx context.Context, q parsing.ItemQuery) (parsing.ItemPage, error) {
	return withParsing(ctx, s.backend, func(ctx context.Context, p *parsing.Service) (parsing.ItemPage, error) { return p.Items(ctx, q) })
}
func (s *ParsingService) Origins(ctx context.Context, id string) ([]parsing.Origin, error) {
	return withParsing(ctx, s.backend, func(ctx context.Context, p *parsing.Service) ([]parsing.Origin, error) { return p.Origins(ctx, id) })
}
func (s *ParsingService) Pause(ctx context.Context, id string) (parsing.Job, error) {
	return withParsing(ctx, s.backend, func(ctx context.Context, p *parsing.Service) (parsing.Job, error) {
		return p.Stop(ctx, id, parsing.Paused)
	})
}
func (s *ParsingService) Cancel(ctx context.Context, id string) (parsing.Job, error) {
	return withParsing(ctx, s.backend, func(ctx context.Context, p *parsing.Service) (parsing.Job, error) {
		return p.Stop(ctx, id, parsing.Canceled)
	})
}
func (s *ParsingService) Resume(ctx context.Context, id string) (parsing.Job, error) {
	return withParsing(ctx, s.backend, func(ctx context.Context, p *parsing.Service) (parsing.Job, error) { return p.Resume(ctx, id, false) })
}
func (s *ParsingService) RetryFailed(ctx context.Context, id string) (parsing.Job, error) {
	return withParsing(ctx, s.backend, func(ctx context.Context, p *parsing.Service) (parsing.Job, error) { return p.Resume(ctx, id, true) })
}
