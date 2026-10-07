package downloads

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/notes"
)

type previewRepository struct {
	Repository
	detail notes.Detail
}

func (r previewRepository) GetSnapshot(context.Context, string) (notes.Detail, error) {
	return r.detail, nil
}
func (r previewRepository) GetRawSnapshot(context.Context, string) (string, error) {
	return `{"secret":"private-raw"}`, nil
}

func TestPreviewOmitsSignedURLsAndInlineBodies(t *testing.T) {
	d := syntheticMedia()
	d.Note.Description = "private-body"
	d.Note.Video.Streams[0].URL += "?signature=private-signature"
	s := &Service{repository: previewRepository{detail: d}}
	c := Defaults(t.TempDir())
	c.Media.Raw = true
	c.Media.Text = true
	plans, err := s.PreviewPlans(context.Background(), BatchPlanInput{SnapshotIDs: []string{d.Snapshot.ID}, Config: c})
	if err != nil || len(plans) != 1 {
		t.Fatalf("preview: %+v, %v", plans, err)
	}
	encoded, err := json.Marshal(plans)
	if err != nil {
		t.Fatal(err)
	}
	for _, secret := range []string{"private-body", "private-raw", "private-signature", "\"urls\"", "\"inline\""} {
		if strings.Contains(string(encoded), secret) {
			t.Fatalf("preview leaked %s", secret)
		}
	}
	if plans[0].KnownBytes <= 0 || plans[0].UnknownSizes <= 0 || len(plans[0].Files) == 0 {
		t.Fatal("preview dropped size or file summary")
	}
}

func TestBatchRejectsSnapshotSpecificMotionSelection(t *testing.T) {
	d := syntheticMedia()
	catalog := Catalog(d)
	c := Defaults(t.TempDir())
	c.Selection.Motion = &VideoSelection{Mode: VideoCustom, CandidateIDs: []string{catalog.Candidates[len(catalog.Candidates)-1].ID}}
	s := &Service{repository: previewRepository{detail: d}}
	if _, err := s.PreviewPlans(context.Background(), BatchPlanInput{SnapshotIDs: []string{"one", "two"}, Config: c}); err == nil {
		t.Fatal("batch accepted snapshot-bound motion IDs")
	}
}
