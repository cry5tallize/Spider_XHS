package bridge

import (
	"context"
	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/notes"
)

type NoteBackend interface {
	WithNotes(context.Context, func(context.Context, *notes.Service) error) error
}
type NoteService struct{ backend NoteBackend }

func NewNoteService(backend NoteBackend) *NoteService { return &NoteService{backend} }

// withNotes keeps lifecycle guarding out of individual bridge methods.
func withNotes[T any](ctx context.Context, backend NoteBackend, call func(context.Context, *notes.Service) (T, error)) (result T, err error) {
	err = backend.WithNotes(ctx, func(ctx context.Context, s *notes.Service) error { var e error; result, e = call(ctx, s); return e })
	return
}
func (s *NoteService) StartParse(ctx context.Context, input notes.StartParse) (notes.ParseJob, error) {
	return withNotes(ctx, s.backend, func(ctx context.Context, n *notes.Service) (notes.ParseJob, error) { return n.StartParse(ctx, input) })
}
func (s *NoteService) GetParseJob(ctx context.Context, id string) (notes.ParseJob, error) {
	return withNotes(ctx, s.backend, func(ctx context.Context, n *notes.Service) (notes.ParseJob, error) { return n.GetParseJob(ctx, id) })
}
func (s *NoteService) ListParseJobs(ctx context.Context) ([]notes.ParseJob, error) {
	return withNotes(ctx, s.backend, func(ctx context.Context, n *notes.Service) ([]notes.ParseJob, error) { return n.ListParseJobs(ctx) })
}
func (s *NoteService) CancelParse(ctx context.Context, id string) (notes.ParseJob, error) {
	return withNotes(ctx, s.backend, func(ctx context.Context, n *notes.Service) (notes.ParseJob, error) { return n.CancelParse(ctx, id) })
}
func (s *NoteService) ListNotes(ctx context.Context, input notes.ListInput) (notes.Page, error) {
	return withNotes(ctx, s.backend, func(ctx context.Context, n *notes.Service) (notes.Page, error) { return n.ListNotes(ctx, input) })
}
func (s *NoteService) GetNote(ctx context.Context, id string) (notes.Detail, error) {
	return withNotes(ctx, s.backend, func(ctx context.Context, n *notes.Service) (notes.Detail, error) { return n.GetNote(ctx, id) })
}
func (s *NoteService) GetSnapshot(ctx context.Context, id string) (notes.Detail, error) {
	return withNotes(ctx, s.backend, func(ctx context.Context, n *notes.Service) (notes.Detail, error) { return n.GetSnapshot(ctx, id) })
}
func (s *NoteService) ListSnapshots(ctx context.Context, id string) ([]notes.Snapshot, error) {
	return withNotes(ctx, s.backend, func(ctx context.Context, n *notes.Service) ([]notes.Snapshot, error) { return n.ListSnapshots(ctx, id) })
}
func (s *NoteService) GetRawSnapshot(ctx context.Context, id string) (string, error) {
	return withNotes(ctx, s.backend, func(ctx context.Context, n *notes.Service) (string, error) { return n.GetRawSnapshot(ctx, id) })
}
