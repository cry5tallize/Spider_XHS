package downloads

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/notes"
	"github.com/cry5tallize/xhs_spider_desktop/internal/xhsapi"
)

// Catalog retains every normalized representation. IDs depend on the snapshot
// and complete candidate content, not an array position or a closed codec list.
func Catalog(d notes.Detail) CandidateCatalog {
	out := CandidateCatalog{SnapshotID: d.Snapshot.ID, Candidates: []Candidate{}, CodecGroups: []string{}, Scenes: []string{}, Formats: []string{}}
	groups, scenes, formats := map[string]bool{}, map[string]bool{}, map[string]bool{}
	add := func(c Candidate) {
		if len(c.URLs) == 0 {
			return
		}
		body, _ := json.Marshal(c)
		c.ID = digest(append([]byte(d.Snapshot.ID+"/"), body...))
		out.Candidates = append(out.Candidates, c)
		if c.Representation.CodecGroup != "" {
			groups[c.Representation.CodecGroup] = true
		}
		if c.Representation.Format != "" {
			formats[c.Representation.Format] = true
		}
		for _, scene := range c.Scenes {
			if scene != "" {
				scenes[scene] = true
			}
		}
	}
	stream := func(kind MediaKind, s xhsapi.VideoStream, index *int, live bool, id string) {
		add(Candidate{Kind: kind, Representation: Representation{CodecGroup: s.CodecGroup, Codec: s.Codec, Format: s.Format, Width: s.Width, Height: s.Height, FPS: s.FPS, ImageIndex: index, Bitrate: s.AverageBitrate, StreamType: s.StreamType, HDRType: s.HDRType, Quality: s.QualityType, MediaID: id}, URLs: URLs(s.URL, append([]string{s.MasterURL}, s.BackupURLs...)...), ExpectedBytes: s.SizeBytes, LivePhoto: live, Scenes: []string{}, Video: &s})
	}
	if d.Note.Video != nil {
		for _, s := range d.Note.Video.Streams {
			stream(MediaVideo, s, nil, false, d.Note.Video.VideoID)
		}
	}
	for _, image := range d.Note.Images {
		index := image.Index + 1
		live := len(image.MotionStreams) > 0 || (image.LivePhoto != nil && *image.LivePhoto)
		for _, v := range image.Variants {
			values := []string{}
			seen := map[string]bool{}
			for _, scene := range append([]string{v.Scene}, imageScenes(v)...) {
				if scene != "" && !seen[scene] {
					seen[scene] = true
					values = append(values, scene)
				}
			}
			add(Candidate{Kind: MediaImage, Representation: Representation{Scene: v.Scene, Format: v.Format, Width: v.Width, Height: v.Height, ImageIndex: &index, MediaID: image.FileID}, URLs: URLs(v.URL), LivePhoto: live, Scenes: values, Image: &v})
		}
		for _, s := range image.MotionStreams {
			stream(MediaMotion, s, &index, true, image.FileID)
		}
	}
	for v := range groups {
		out.CodecGroups = append(out.CodecGroups, v)
	}
	for v := range scenes {
		out.Scenes = append(out.Scenes, v)
	}
	for v := range formats {
		out.Formats = append(out.Formats, v)
	}
	sort.Strings(out.CodecGroups)
	sort.Strings(out.Scenes)
	sort.Strings(out.Formats)
	return out
}
func imageScenes(v xhsapi.ImageVariant) []string {
	out := []string{}
	for _, source := range v.Sources {
		out = append(out, source.Scene)
	}
	return out
}
func equalAny(value string, allowed []string) bool {
	if len(allowed) == 0 {
		return true
	}
	for _, v := range allowed {
		if strings.EqualFold(v, value) {
			return true
		}
	}
	return false
}
func sceneKey(value string) string {
	key := strings.ToUpper(strings.ReplaceAll(value, "_", ""))
	if key == "WBDFT" || key == "DFT" {
		return "WEBDFT"
	}
	return key
}
func sceneMatches(c Candidate, allowed []string) bool {
	for _, wanted := range allowed {
		for _, actual := range c.Scenes {
			if sceneKey(wanted) == sceneKey(actual) {
				return true
			}
		}
	}
	return false
}
func videoMatches(c Candidate, s VideoSelection) bool {
	r := c.Representation
	if !equalAny(r.CodecGroup, s.CodecGroups) && !equalAny(r.Codec, s.CodecGroups) {
		return false
	}
	if !equalAny(r.Format, s.Containers) {
		return false
	}
	if s.MinLongEdge > 0 || s.MaxLongEdge > 0 {
		if r.Width == nil || r.Height == nil {
			if !s.AllowUnknown {
				return false
			}
		} else {
			edge := max(*r.Width, *r.Height)
			if s.MinLongEdge > 0 && edge < s.MinLongEdge || s.MaxLongEdge > 0 && edge > s.MaxLongEdge {
				return false
			}
		}
	}
	if s.MinFPS > 0 || s.MaxFPS > 0 {
		if r.FPS == nil {
			if !s.AllowUnknown {
				return false
			}
		} else if s.MinFPS > 0 && *r.FPS < s.MinFPS || s.MaxFPS > 0 && *r.FPS > s.MaxFPS {
			return false
		}
	}
	if s.HDR != HDRAny {
		if r.HDRType == nil {
			return s.AllowUnknown
		}
		hdr := *r.HDRType != 0
		if s.HDR == HDROnly && !hdr || s.HDR == HDRExclude && hdr {
			return false
		}
	}
	return true
}
func choose(catalog CandidateCatalog, c Config) ([]Candidate, []string, error) {
	videoMode := c.Selection.Video.Mode
	if videoMode == VideoDefault {
		videoMode = VideoBest
	}
	imageMode := c.Selection.Images.Mode
	if imageMode == ImageDefault {
		imageMode = ImageBest
	}
	byID := map[string]Candidate{}
	for _, candidate := range catalog.Candidates {
		byID[candidate.ID] = candidate
	}
	for _, id := range c.Selection.Video.CandidateIDs {
		if videoMode != VideoCustom {
			break
		}
		candidate, ok := byID[id]
		if !ok || (candidate.Kind != MediaVideo && candidate.Kind != MediaMotion) {
			return nil, nil, fmt.Errorf("视频候选不属于当前快照，请重新选择")
		}
	}
	for _, id := range c.Selection.Images.CandidateIDs {
		if imageMode != ImageCustom {
			break
		}
		candidate, ok := byID[id]
		if !ok || candidate.Kind != MediaImage {
			return nil, nil, fmt.Errorf("图片候选不属于当前快照，请重新选择")
		}
	}
	videoIDs, imageIDs := map[string]bool{}, map[string]bool{}
	for _, id := range c.Selection.Video.CandidateIDs {
		videoIDs[id] = true
	}
	for _, id := range c.Selection.Images.CandidateIDs {
		imageIDs[id] = true
	}
	out := []Candidate{}
	warnings := []string{}
	seen := map[string]bool{}
	for _, candidate := range catalog.Candidates {
		r := candidate.Representation
		index := 0
		if r.ImageIndex != nil {
			index = *r.ImageIndex
		}
		scope := fmt.Sprintf("%d:%d", candidate.Kind, index)
		if candidate.Kind == MediaImage {
			if !equalAny(r.Format, c.Selection.Images.Formats) || (c.Selection.Images.FirstIndex > 0 && index < c.Selection.Images.FirstIndex) || (c.Selection.Images.LastIndex > 0 && index > c.Selection.Images.LastIndex) {
				continue
			}
			if candidate.LivePhoto && c.Selection.LivePhoto == LiveMotion {
				continue
			}
			switch imageMode {
			case ImageBest:
				if seen[scope] {
					continue
				}
			case ImageScenes:
				if !sceneMatches(candidate, c.Selection.Images.Scenes) {
					continue
				}
			case ImageCustom:
				if !imageIDs[candidate.ID] {
					continue
				}
			}
		} else {
			if candidate.Kind == MediaMotion && c.Selection.LivePhoto == LiveStatic {
				continue
			}
			if !videoMatches(candidate, c.Selection.Video) {
				continue
			}
			switch videoMode {
			case VideoBest:
				if seen[scope] {
					continue
				}
			case VideoPerCodec:
				codec := r.Codec
				if codec == "" {
					codec = r.CodecGroup
				}
				scope += "/" + strings.ToLower(codec)
				if seen[scope] {
					continue
				}
			case VideoCustom:
				if !videoIDs[candidate.ID] {
					continue
				}
			}
		}
		seen[scope] = true
		out = append(out, candidate)
	}
	if len(out) == 0 {
		warnings = append(warnings, "筛选后没有可用媒体候选")
	}
	return out, warnings, nil
}
