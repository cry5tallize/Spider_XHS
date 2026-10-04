package downloads

import (
	"context"
	"encoding/json"
	"errors"
)

type BatchPlanInput struct {
	SnapshotIDs []string `json:"snapshot_ids"`
	Config      Config   `json:"config"`
}

func (s *Service) BuildPlans(ctx context.Context, input BatchPlanInput) ([]Plan, error) {
	if len(input.SnapshotIDs) == 0 || len(input.SnapshotIDs) > 200 {
		return nil, errors.New("每次最多预览 200 条笔记")
	}
	if input.Config.Selection.Video.Mode == VideoCustom || input.Config.Selection.Images.Mode == ImageCustom {
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
