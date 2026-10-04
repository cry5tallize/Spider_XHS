package downloads

import (
	"fmt"
	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/notes"
	"github.com/cry5tallize/xhs_spider_desktop/internal/xhsapi"
	"path/filepath"
	"strings"
	"testing"
)

func intRef(v int64) *int64 { return &v }
func syntheticMedia() notes.Detail {
	d := notes.Detail{Snapshot: notes.Snapshot{ID: "snapshot", NoteID: "note"}, Note: xhsapi.Note{ID: "note", Title: "same title", User: xhsapi.NoteUser{ID: "user", Nickname: "author"}, Type: "video", Video: &xhsapi.NoteVideoInfo{Streams: []xhsapi.VideoStream{}}}}
	for i := 0; i < 8; i++ {
		group := "EF7"
		if i < 2 {
			group = "EF4"
		}
		if i == 7 {
			group = "NEXT_CODEC"
		}
		d.Note.Video.Streams = append(d.Note.Video.Streams, xhsapi.VideoStream{StreamMetadata: xhsapi.StreamMetadata{Format: "mp4", Width: intRef(2160), Height: intRef(3840), AverageBitrate: intRef(int64(2000 + i))}, CodecGroup: group, URL: fmt.Sprintf("https://cdn.invalid/video/%d", i), BackupURLs: []string{fmt.Sprintf("https://backup.invalid/video/%d", i)}})
	}
	for index := 0; index < 2; index++ {
		image := xhsapi.NoteImageInfo{Index: index, FileID: fmt.Sprintf("file%d", index), Variants: []xhsapi.ImageVariant{}, MotionStreams: []xhsapi.VideoStream{}}
		for variant := 0; variant < 6; variant++ {
			scene := fmt.Sprintf("SCENE_%d", variant)
			if variant == 0 {
				scene = "WebDft"
			}
			image.Variants = append(image.Variants, xhsapi.ImageVariant{Scene: scene, Format: "webp", URL: fmt.Sprintf("https://cdn.invalid/image/%d/%d", index, variant)})
		}
		for stream := 0; stream < 3; stream++ {
			image.MotionStreams = append(image.MotionStreams, xhsapi.VideoStream{CodecGroup: "EF7", URL: fmt.Sprintf("https://cdn.invalid/motion/%d/%d", index, stream), StreamMetadata: xhsapi.StreamMetadata{Format: "mp4"}})
		}
		d.Note.Images = append(d.Note.Images, image)
	}
	return d
}
func TestAllMediaKeepsDynamicStreamsVariantsAndLivePairs(t *testing.T) {
	d := syntheticMedia()
	c := Defaults(t.TempDir())
	c.Media.VideoCover = true
	c.Media.Pretty = false
	c.Media.Manifest = false
	c.Selection.Video.Mode = VideoAll
	c.Selection.Images.Mode = ImageAll
	p, err := BuildPlan(d, c, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(p.Items) != 8+12+6 {
		t.Fatalf("lost arbitrary candidate counts: %d", len(p.Items))
	}
	seen := map[string]bool{}
	for _, i := range p.Items {
		if seen[i.RelativePath] {
			t.Fatal("same codec/dimension files collided")
		}
		seen[i.RelativePath] = true
	}
	if len(p.LivePairs) != 2 || len(p.LivePairs[0].StaticKeys) != 6 || len(p.LivePairs[0].MotionKeys) != 3 {
		t.Fatal("LivePhoto variants not paired")
	}
	// Repeated primary links remain selectable metadata, but download once.
	d.Note.Video.Streams = append(d.Note.Video.Streams, d.Note.Video.Streams[0])
	p, err = BuildPlan(d, c, nil)
	if err != nil || len(p.Items) != 26 {
		t.Fatal("duplicate URL planned twice")
	}
}
func TestCustomSelectionIsSnapshotBoundAndSceneAliasesMatch(t *testing.T) {
	d := syntheticMedia()
	catalog := Catalog(d)
	again := Catalog(d)
	if catalog.Candidates[0].ID != again.Candidates[0].ID {
		t.Fatal("unstable candidate ID")
	}
	c := Defaults(t.TempDir())
	c.Media.VideoCover = true
	c.Media.Pretty = false
	c.Media.Manifest = false
	c.Media.LivePhotoMotion = false
	c.Selection.Video.Mode = VideoCustom
	c.Selection.Video.CandidateIDs = []string{catalog.Candidates[1].ID}
	c.Selection.Images.Mode = ImageScenes
	c.Selection.Images.Scenes = []string{"WB_DFT"}
	p, err := BuildPlan(d, c, nil)
	if err != nil || len(p.Items) != 3 {
		t.Fatal("custom or scene alias selection failed", err)
	}
	d.Snapshot.ID = "new-snapshot"
	if _, err = BuildPlan(d, c, nil); err == nil {
		t.Fatal("old candidate silently selected in new snapshot")
	}
}
func TestNamingTemplatesRetainIDsAfterLongVariableExpansion(t *testing.T) {
	d := syntheticMedia()
	d.Note.Title = strings.Repeat("very-long-title", 30)
	c := Defaults(t.TempDir())
	c.Selection.Video.Mode = VideoAll
	c.Naming.DirectoryTemplate = "{title}_{note_id}"
	c.Naming.FileTemplate = "{title}_{dimensions}_{variant_key}"
	p, err := BuildPlan(d, c, nil)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(p.RelativeDirectory, d.Note.ID) {
		t.Fatal("note ID truncated out of directory")
	}
	seen := map[string]bool{}
	for _, item := range p.Items {
		if seen[item.RelativePath] {
			t.Fatal("candidate key truncated out of filename")
		}
		seen[item.RelativePath] = true
		if !filepath.IsLocal(item.RelativePath) {
			t.Fatal("template escaped root")
		}
	}
}
