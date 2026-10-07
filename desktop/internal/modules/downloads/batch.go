package downloads

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"strings"
	"time"
	"unicode/utf8"
)

func (s *Service) GetCandidates(ctx context.Context, id string) (CandidateCatalog, error) {
	d, err := s.repository.GetSnapshot(ctx, id)
	if err != nil {
		return CandidateCatalog{}, err
	}
	return Catalog(d), nil
}
func (s *Service) CreateTasks(ctx context.Context, input CreateBatch) (Batch, error) {
	input.RequestID = strings.TrimSpace(input.RequestID)
	if input.RequestID == "" || len(input.RequestID) > 128 || len(input.SnapshotIDs) == 0 || len(input.SnapshotIDs) > 200 {
		return Batch{}, errors.New("批量下载请求无效，每次最多 200 条笔记")
	}
	if hasCustomSelection(input.Config) {
		return Batch{}, errors.New("批量下载请使用规格筛选或自动选择，自定义候选仅属于单条笔记")
	}
	encoded, _ := json.Marshal(input)
	fingerprint := digest(encoded)
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closing || s.ctx.Err() != nil {
		return Batch{}, ErrClosing
	}
	old, oldHash, err := s.repository.FindDownloadBatch(ctx, input.RequestID)
	if err == nil {
		if oldHash != fingerprint {
			return Batch{}, ErrConflict
		}
		return old, nil
	}
	if !errors.Is(err, ErrNotFound) {
		return Batch{}, err
	}
	b := Batch{ID: rand.Text(), TaskIDs: []string{}, CreatedAtMS: time.Now().UnixMilli()}
	plans := []Plan{}
	seen := map[string]bool{}
	bytes := 0
	for _, id := range input.SnapshotIDs {
		p, e := s.BuildPlan(ctx, PlanInput{SnapshotID: id, Config: input.Config})
		if e != nil {
			return Batch{}, e
		}
		if seen[p.NoteID] {
			continue
		}
		seen[p.NoteID] = true
		body, _ := json.Marshal(p)
		bytes += len(body)
		for _, item := range p.Items {
			bytes += len(item.Inline)
		}
		if bytes > 64*1024*1024 {
			return Batch{}, errors.New("批量计划超过 64 MiB，请分批创建")
		}
		plans = append(plans, p)
		b.TaskIDs = append(b.TaskIDs, rand.Text())
	}
	if err = s.repository.CreateDownloadBatch(ctx, b, input.RequestID, fingerprint, plans); err != nil {
		return Batch{}, err
	}
	for _, id := range b.TaskIDs {
		s.publishCurrent(ctx, id)
	}
	s.signal()
	return b, nil
}
func (s *Service) ListPresets(ctx context.Context) ([]Preset, error) {
	return s.repository.ListDownloadPresets(ctx)
}
func (s *Service) SavePreset(ctx context.Context, input SavePreset) (Preset, error) {
	input.Name = strings.TrimSpace(input.Name)
	if input.Name == "" || utf8.RuneCountInString(input.Name) > 128 {
		return Preset{}, errors.New("预设名称需要 1～128 个字符")
	}
	if hasCustomSelection(input.Config) {
		return Preset{}, errors.New("自定义候选属于当前笔记，请用自动选择或规格筛选保存通用预设")
	}
	input.Config.Selection.Video.CandidateIDs = nil
	input.Config.Selection.Images.CandidateIDs = nil
	if input.Config.Selection.Motion != nil {
		motion := *input.Config.Selection.Motion
		motion.CandidateIDs = nil
		input.Config.Selection.Motion = &motion
	}
	check := input.Config
	if check.Output.Directory == "" && s.resolveOutputDirectory != nil {
		directory, err := s.resolveOutputDirectory(ctx)
		if err != nil {
			return Preset{}, err
		}
		check.Output.Directory = directory
	}
	if err := check.Validate(); err != nil {
		return Preset{}, err
	}
	if input.ID == "" {
		input.ID = rand.Text()
	}
	p := Preset{ID: input.ID, Name: input.Name, Config: input.Config, UpdatedAtMS: time.Now().UnixMilli()}
	return p, s.repository.SaveDownloadPreset(ctx, p)
}
func (s *Service) DeletePreset(ctx context.Context, id string) error {
	return s.repository.DeleteDownloadPreset(ctx, id)
}
