package downloads

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
)

type BatchPlanInput struct {
	SnapshotIDs []string `json:"snapshot_ids"`
	Config      Config   `json:"config"`
}

// PreviewFile contains no signed URLs or inline file bodies.
type PreviewFile struct {
	Sequence       int            `json:"sequence"`
	Kind           MediaKind      `json:"kind"`
	Representation Representation `json:"representation"`
	Bytes          *int64         `json:"bytes"`
	RelativePath   string         `json:"relative_path"`
}
type PlanPreview struct {
	SnapshotID   string        `json:"snapshot_id"`
	NoteID       string        `json:"note_id"`
	Title        string        `json:"title"`
	Directory    string        `json:"directory"`
	Files        []PreviewFile `json:"files"`
	KnownBytes   int64         `json:"known_bytes"`
	UnknownSizes int           `json:"unknown_sizes"`
	Warnings     []string      `json:"warnings"`
}

func hasCustomSelection(c Config) bool {
	return c.Selection.Video.Mode == VideoCustom || c.Selection.Images.Mode == ImageCustom || (c.Selection.Motion != nil && c.Selection.Motion.Mode == VideoCustom)
}
func (s *Service) PreviewPlans(ctx context.Context, input BatchPlanInput) ([]PlanPreview, error) {
	if len(input.SnapshotIDs) == 0 || len(input.SnapshotIDs) > 200 {
		return nil, errors.New("每次最多预览 200 条笔记")
	}
	if len(input.SnapshotIDs) > 1 && hasCustomSelection(input.Config) {
		return nil, errors.New("自定义候选仅用于单条笔记")
	}
	out := []PlanPreview{}
	seen := map[string]bool{}
	previewBytes := 0
	for _, id := range input.SnapshotIDs {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		plan, err := s.BuildPlan(ctx, PlanInput{SnapshotID: id, Config: input.Config})
		if err != nil && !errors.Is(err, ErrNoContent) {
			return nil, err
		}
		if seen[plan.NoteID] {
			continue
		}
		seen[plan.NoteID] = true
		p := PlanPreview{SnapshotID: id, NoteID: plan.NoteID, Title: plan.Title, Directory: plan.RelativeDirectory, Files: []PreviewFile{}, Warnings: append([]string{}, plan.Warnings...)}
		for _, item := range plan.Items {
			p.Files = append(p.Files, PreviewFile{item.Sequence, item.Kind, item.Representation, item.ExpectedBytes, item.RelativePath})
			if item.ExpectedBytes != nil {
				p.KnownBytes += *item.ExpectedBytes
			} else {
				p.UnknownSizes++
			}
		}
		encoded, err := json.Marshal(p)
		if err != nil {
			return nil, fmt.Errorf("无法生成预览：%w", err)
		}
		previewBytes += len(encoded)
		if previewBytes > 8*1024*1024 {
			return nil, errors.New("预览明细超过 8 MiB，请减少导出规格或分批选择")
		}
		out = append(out, p)
	}
	return out, nil
}

func (s *Service) BuildPlans(ctx context.Context, input BatchPlanInput) ([]Plan, error) {
	if len(input.SnapshotIDs) == 0 || len(input.SnapshotIDs) > 200 {
		return nil, errors.New("每次最多预览 200 条笔记")
	}
	if hasCustomSelection(input.Config) {
		return nil, errors.New("自定义候选仅用于单条笔记")
	}
	plans := []Plan{}
	seen := map[string]bool{}
	bytes := 0
	for _, id := range input.SnapshotIDs {
		p, err := s.BuildPlan(ctx, PlanInput{SnapshotID: id, Config: input.Config})
		if err != nil {
			return nil, err
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
			return nil, errors.New("批量计划过大，请分批预览")
		}
		plans = append(plans, p)
	}
	return plans, nil
}
