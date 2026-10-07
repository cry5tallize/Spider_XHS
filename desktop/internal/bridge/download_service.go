package bridge

import (
	"context"
	"errors"
	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/downloads"
	"github.com/wailsapp/wails/v3/pkg/application"
	"os"
	"path/filepath"
)

func init() { application.RegisterEvent[downloads.EventBatch]("downloads:changed") }

type DownloadBackend interface {
	WithDownloads(context.Context, func(context.Context, *downloads.Service) error) error
	GetDownloadDefaults(context.Context) (downloads.Config, error)
}
type DownloadService struct {
	backend       DownloadBackend
	openDirectory func(string) error
}

func NewDownloadService(b DownloadBackend, openDirectory func(string) error) *DownloadService {
	return &DownloadService{backend: b, openDirectory: openDirectory}
}

func (s *DownloadService) OpenDirectory(ctx context.Context, id string) error {
	return s.backend.WithDownloads(ctx, func(ctx context.Context, d *downloads.Service) error {
		t, err := d.GetTask(ctx, id)
		if err != nil {
			return err
		}
		root, err := os.OpenRoot(t.Config.Output.Directory)
		if err != nil {
			return errors.New("下载目录不存在或不可访问")
		}
		defer root.Close()
		info, err := root.Stat(t.RelativeDirectory)
		if err != nil || !info.IsDir() {
			return errors.New("笔记目录尚未创建")
		}
		if s.openDirectory == nil {
			return errors.New("当前环境不支持打开目录")
		}
		if err := ctx.Err(); err != nil {
			return err
		}
		return s.openDirectory(filepath.Join(t.Config.Output.Directory, t.RelativeDirectory))
	})
}
func withDownloads[T any](ctx context.Context, b DownloadBackend, call func(context.Context, *downloads.Service) (T, error)) (result T, err error) {
	err = b.WithDownloads(ctx, func(ctx context.Context, s *downloads.Service) error { var e error; result, e = call(ctx, s); return e })
	return
}
func (s *DownloadService) GetDefaultConfig(ctx context.Context) (downloads.Config, error) {
	return s.backend.GetDownloadDefaults(ctx)
}
func (s *DownloadService) BuildPlan(ctx context.Context, i downloads.PlanInput) (downloads.Plan, error) {
	return withDownloads(ctx, s.backend, func(ctx context.Context, d *downloads.Service) (downloads.Plan, error) { return d.BuildPlan(ctx, i) })
}
func (s *DownloadService) GetCandidates(ctx context.Context, id string) (downloads.CandidateCatalog, error) {
	return withDownloads(ctx, s.backend, func(ctx context.Context, d *downloads.Service) (downloads.CandidateCatalog, error) {
		return d.GetCandidates(ctx, id)
	})
}
func (s *DownloadService) CreateTasks(ctx context.Context, i downloads.CreateBatch) (downloads.Batch, error) {
	return withDownloads(ctx, s.backend, func(ctx context.Context, d *downloads.Service) (downloads.Batch, error) { return d.CreateTasks(ctx, i) })
}
func (s *DownloadService) BuildPlans(ctx context.Context, i downloads.BatchPlanInput) ([]downloads.Plan, error) {
	return withDownloads(ctx, s.backend, func(ctx context.Context, d *downloads.Service) ([]downloads.Plan, error) { return d.BuildPlans(ctx, i) })
}
func (s *DownloadService) PreviewPlans(ctx context.Context, i downloads.BatchPlanInput) ([]downloads.PlanPreview, error) {
	return withDownloads(ctx, s.backend, func(ctx context.Context, d *downloads.Service) ([]downloads.PlanPreview, error) {
		return d.PreviewPlans(ctx, i)
	})
}
func (s *DownloadService) ListPresets(ctx context.Context) ([]downloads.Preset, error) {
	return withDownloads(ctx, s.backend, func(ctx context.Context, d *downloads.Service) ([]downloads.Preset, error) { return d.ListPresets(ctx) })
}
func (s *DownloadService) SavePreset(ctx context.Context, i downloads.SavePreset) (downloads.Preset, error) {
	return withDownloads(ctx, s.backend, func(ctx context.Context, d *downloads.Service) (downloads.Preset, error) { return d.SavePreset(ctx, i) })
}
func (s *DownloadService) DeletePreset(ctx context.Context, id string) error {
	return s.backend.WithDownloads(ctx, func(ctx context.Context, d *downloads.Service) error { return d.DeletePreset(ctx, id) })
}
func (s *DownloadService) CreateTask(ctx context.Context, i downloads.CreateTask) (downloads.Task, error) {
	return withDownloads(ctx, s.backend, func(ctx context.Context, d *downloads.Service) (downloads.Task, error) { return d.CreateTask(ctx, i) })
}
func (s *DownloadService) GetTask(ctx context.Context, id string) (downloads.Task, error) {
	return withDownloads(ctx, s.backend, func(ctx context.Context, d *downloads.Service) (downloads.Task, error) { return d.GetTask(ctx, id) })
}
func (s *DownloadService) ListTaskItems(ctx context.Context, id string) ([]downloads.Item, error) {
	return withDownloads(ctx, s.backend, func(ctx context.Context, d *downloads.Service) ([]downloads.Item, error) { return d.Items(ctx, id) })
}
func (s *DownloadService) ListTasks(ctx context.Context, i downloads.ListInput) (downloads.Page, error) {
	return withDownloads(ctx, s.backend, func(ctx context.Context, d *downloads.Service) (downloads.Page, error) { return d.List(ctx, i, false) })
}
func (s *DownloadService) QueryHistory(ctx context.Context, i downloads.ListInput) (downloads.Page, error) {
	return withDownloads(ctx, s.backend, func(ctx context.Context, d *downloads.Service) (downloads.Page, error) { return d.List(ctx, i, true) })
}
func (s *DownloadService) Pause(ctx context.Context, id string) (downloads.Task, error) {
	return withDownloads(ctx, s.backend, func(ctx context.Context, d *downloads.Service) (downloads.Task, error) {
		return d.Stop(ctx, id, downloads.Paused)
	})
}
func (s *DownloadService) Cancel(ctx context.Context, id string) (downloads.Task, error) {
	return withDownloads(ctx, s.backend, func(ctx context.Context, d *downloads.Service) (downloads.Task, error) {
		return d.Stop(ctx, id, downloads.Canceled)
	})
}
func (s *DownloadService) Resume(ctx context.Context, id string) (downloads.Task, error) {
	return withDownloads(ctx, s.backend, func(ctx context.Context, d *downloads.Service) (downloads.Task, error) { return d.Resume(ctx, id) })
}
func (s *DownloadService) RetryFailed(ctx context.Context, id string) (downloads.Task, error) {
	return s.Resume(ctx, id)
}
func (s *DownloadService) GetActiveSnapshots(ctx context.Context) (downloads.ActiveSnapshot, error) {
	return withDownloads(ctx, s.backend, func(ctx context.Context, d *downloads.Service) (downloads.ActiveSnapshot, error) {
		return d.Active(ctx)
	})
}
func (s *DownloadService) GetChangesSince(ctx context.Context, i downloads.ChangesInput) (downloads.Changes, error) {
	return withDownloads(ctx, s.backend, func(ctx context.Context, d *downloads.Service) (downloads.Changes, error) { return d.Changes(i), nil })
}
