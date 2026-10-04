package downloads

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/url"
	"path/filepath"
	"strconv"
	"strings"
	"unicode"

	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/notes"
)

func (c Config) Validate() error {
	if c.SchemaVersion != 1 {
		return errors.New("不支持的下载配置版本")
	}
	if !filepath.IsAbs(c.Output.Directory) || strings.ContainsRune(c.Output.Directory, 0) {
		return errors.New("请选择绝对路径下载目录")
	}
	if c.Output.ExistingPolicy != Overwrite && c.Output.ExistingPolicy != SkipExisting {
		return errors.New("不支持的文件策略")
	}
	if c.Dedup.Mode != DedupOff && c.Dedup.Mode != SameOutput {
		return errors.New("不支持的历史过滤模式")
	}
	if c.Execution.RetriesPerURL < 0 || c.Execution.RetriesPerURL > 5 || c.Execution.MaxAttempts < 1 || c.Execution.MaxAttempts > 64 {
		return errors.New("下载尝试次数无效")
	}
	v, i := c.Selection.Video, c.Selection.Images
	if v.Mode < VideoDefault || v.Mode > VideoCustom || i.Mode < ImageDefault || i.Mode > ImageCustom || c.Selection.LivePhoto < LiveDefault || c.Selection.LivePhoto > LiveMotion || v.HDR < HDRAny || v.HDR > HDRExclude {
		return errors.New("媒体选择模式无效")
	}
	if v.MinLongEdge < 0 || v.MaxLongEdge < 0 || (v.MaxLongEdge > 0 && v.MinLongEdge > v.MaxLongEdge) || v.MinFPS < 0 || v.MaxFPS < 0 || (v.MaxFPS > 0 && v.MinFPS > v.MaxFPS) || math.IsNaN(v.MinFPS) || math.IsNaN(v.MaxFPS) || math.IsInf(v.MinFPS, 0) || math.IsInf(v.MaxFPS, 0) {
		return errors.New("视频尺寸或帧率范围无效")
	}
	if i.FirstIndex < 0 || i.LastIndex < 0 || (i.LastIndex > 0 && i.FirstIndex > i.LastIndex) {
		return errors.New("图片顺序范围无效")
	}
	if v.Mode == VideoCustom && len(v.CandidateIDs) == 0 {
		return errors.New("自定义视频模式需要选择候选")
	}
	if i.Mode == ImageCustom && len(i.CandidateIDs) == 0 {
		return errors.New("自定义图片模式需要选择候选")
	}
	if i.Mode == ImageScenes && len(i.Scenes) == 0 {
		return errors.New("请选择图片 scene")
	}
	if err := validateNaming(c.Naming); err != nil {
		return err
	}
	return nil
}
func digest(value []byte) string { h := sha256.Sum256(value); return hex.EncodeToString(h[:]) }

// SafeName also handles Windows device names and trailing dots/spaces.
func SafeName(value string, limit int) string {
	runes := []rune(strings.Map(func(r rune) rune {
		if unicode.IsControl(r) || strings.ContainsRune(`<>:"/\|?*`, r) {
			return '_'
		}
		return r
	}, value))
	if len(runes) > limit {
		runes = runes[:limit]
	}
	s := strings.Trim(strings.TrimSpace(string(runes)), ". ")
	if s == "" {
		s = "untitled"
	}
	base := strings.ToUpper(strings.SplitN(s, ".", 2)[0])
	if base == "CON" || base == "PRN" || base == "AUX" || base == "NUL" || base == "CONIN$" || base == "CONOUT$" || (len(base) == 4 && (strings.HasPrefix(base, "COM") || strings.HasPrefix(base, "LPT")) && strings.ContainsRune("123456789¹²³", rune(base[3]))) {
		s = "_" + s
	}
	return s
}
func URLs(primary string, other ...string) []string {
	out := []string{}
	seen := map[string]bool{}
	for _, raw := range append([]string{primary}, other...) {
		if raw == "" || seen[raw] {
			continue
		}
		u, err := url.Parse(raw)
		if err != nil || u.Host == "" || u.User != nil || (u.Scheme != "http" && u.Scheme != "https") {
			continue
		}
		seen[raw] = true
		out = append(out, raw)
	}
	return out
}
func extension(format string, urls []string, fallback string) string {
	format = strings.ToLower(strings.TrimPrefix(format, "."))
	if format == "jpeg" {
		format = "jpg"
	}
	for _, allowed := range []string{"jpg", "png", "webp", "avif", "gif", "mp4", "webm", "mov", "flv", "m4v"} {
		if format == allowed {
			return format
		}
	}
	if len(urls) > 0 {
		u, _ := url.Parse(urls[0])
		ext := strings.TrimPrefix(strings.ToLower(filepath.Ext(u.Path)), ".")
		for _, allowed := range []string{"jpg", "jpeg", "png", "webp", "avif", "gif", "mp4", "webm", "mov", "flv"} {
			if ext == allowed {
				return ext
			}
		}
	}
	return fallback
}
func BuildPlan(detail notes.Detail, c Config, raw []byte) (Plan, error) {
	if err := c.Validate(); err != nil {
		return Plan{}, err
	}
	n := detail.Note
	p := Plan{NoteID: n.ID, SnapshotID: detail.Snapshot.ID, Title: n.Title, AuthorID: n.User.ID, AuthorName: n.User.Nickname, AccountID: detail.Snapshot.AccountID, Config: c, Items: []PlannedItem{}, Warnings: []string{}}
	p.RelativeDirectory = filepath.Join(SafeName(n.User.Nickname, 32)+"_"+SafeName(n.User.ID, 28), SafeName(n.ID, 28)+"_"+SafeName(n.Title, 40))
	p.RelativeDirectory = namedDirectory(detail, c.Naming, p.RelativeDirectory)
	p.LivePairs = []LivePair{}
	add := func(kind MediaKind, rep Representation, urls []string, size *int64, label string, body []byte) {
		identity, _ := json.Marshal(struct {
			Snapshot, Note string
			Kind           MediaKind
			Rep            Representation
			URLs           []string
		}{p.SnapshotID, p.NoteID, kind, rep, urls})
		confidence := IdentityWeak
		key := digest(identity)
		if body != nil {
			confidence = IdentityStrong
			key = digest(append([]byte(fmt.Sprintf("%s:%d:", n.ID, kind)), body...))
			length := int64(len(body))
			size = &length
		}
		if kind == MediaManifest {
			confidence = IdentityWeak
		}
		ext := extension(rep.Format, urls, "bin")
		switch kind {
		case MediaVideo, MediaMotion:
			ext = extension(rep.Format, urls, "mp4")
		case MediaPretty, MediaRaw, MediaManifest:
			ext = "json"
		case MediaText:
			ext = "txt"
		}
		name := label + "_" + key[:12] + "." + ext
		if kind == MediaManifest {
			name = "manifest.json"
		} else if c.Naming.FileTemplate != "" {
			values := baseNamingValues(detail)
			values["media_kind"] = map[MediaKind]string{MediaVideo: "video", MediaImage: "image", MediaMotion: "motion", MediaPretty: "pretty", MediaRaw: "raw", MediaText: "text"}[kind]
			values["variant_key"] = key[:12]
			values["codec"] = rep.Codec
			values["codec_group"] = rep.CodecGroup
			if rep.ImageIndex != nil {
				values["image_index"] = fmt.Sprintf("%03d", *rep.ImageIndex)
			}
			if rep.Width != nil && rep.Height != nil {
				values["dimensions"] = fmt.Sprintf("%dx%d", *rep.Width, *rep.Height)
			}
			if rep.FPS != nil {
				values["fps"] = strconv.FormatFloat(*rep.FPS, 'f', -1, 64)
			}
			base := SafeName(renderTemplate(c.Naming.FileTemplate, values), 120)
			if !strings.Contains(base, key[:12]) {
				base += "_" + key[:12]
			}
			name = base + "." + ext
		}
		p.Items = append(p.Items, PlannedItem{Sequence: len(p.Items) + 1, Kind: kind, AssetKey: key, Confidence: confidence, Representation: rep, RelativePath: filepath.Join(p.RelativeDirectory, name), URLs: urls, ExpectedBytes: size, Inline: body})
	}
	selected, warnings, err := choose(Catalog(detail), c)
	if err != nil {
		return p, err
	}
	p.Warnings = append(p.Warnings, warnings...)
	isVideo := n.Type == "video" || n.Video != nil
	// Identical primary URLs represent one physical download; pair metadata can
	// reference that asset from more than one image without duplicating links.
	urlAssets := map[string]string{}
	pairs := map[int]*LivePair{}
	videoCount := 0
	for _, candidate := range selected {
		r := candidate.Representation
		index := 0
		if r.ImageIndex != nil {
			index = *r.ImageIndex
		}
		if candidate.Kind == MediaVideo && !c.Media.Video || candidate.Kind == MediaMotion && !c.Media.LivePhotoMotion || candidate.Kind == MediaImage && ((isVideo && !c.Media.VideoCover) || (!isVideo && !c.Media.Images)) {
			continue
		}
		key := urlAssets[candidate.URLs[0]]
		if key == "" {
			label := "video"
			if candidate.Kind == MediaImage {
				label = fmt.Sprintf("image_%03d", index)
			}
			if candidate.Kind == MediaMotion {
				label = fmt.Sprintf("motion_%03d", index)
			}
			add(candidate.Kind, r, candidate.URLs, candidate.ExpectedBytes, label, nil)
			item := &p.Items[len(p.Items)-1]
			item.CandidateID = candidate.ID
			// All candidate metadata participates in identity, including same-
			// codec/same-dimension streams that differ in bitrate or provenance.
			key = item.AssetKey
			urlAssets[candidate.URLs[0]] = key
		}
		if candidate.Kind == MediaVideo {
			videoCount++
		}
		if candidate.LivePhoto {
			pair := pairs[index]
			if pair == nil {
				pair = &LivePair{ImageIndex: index, StaticKeys: []string{}, MotionKeys: []string{}}
				pairs[index] = pair
			}
			if candidate.Kind == MediaImage {
				pair.StaticKeys = appendUnique(pair.StaticKeys, key)
			}
			if candidate.Kind == MediaMotion {
				pair.MotionKeys = appendUnique(pair.MotionKeys, key)
			}
		}
	}
	if isVideo && c.Media.Video && videoCount == 0 {
		p.Warnings = append(p.Warnings, "没有符合配置的主视频候选")
	}
	for _, image := range n.Images {
		index := image.Index + 1
		if pair := pairs[index]; pair != nil {
			p.LivePairs = append(p.LivePairs, *pair)
			if c.Media.LivePhotoMotion && c.Selection.LivePhoto != LiveStatic && len(pair.MotionKeys) == 0 {
				p.Warnings = append(p.Warnings, fmt.Sprintf("LivePhoto %d 没有符合配置的动态流", index))
			}
		}
	}
	if c.Media.Pretty {
		body, err := json.MarshalIndent(n, "", "  ")
		if err != nil {
			return p, err
		}
		add(MediaPretty, Representation{}, nil, nil, "note", body)
	}
	if c.Media.Text {
		add(MediaText, Representation{}, nil, nil, "text", []byte(n.Title+"\n\n"+n.Description+"\n"))
	}
	if c.Media.Raw {
		if !json.Valid(raw) {
			return p, errors.New("原始响应不可用")
		}
		add(MediaRaw, Representation{}, nil, nil, "raw", raw)
	}
	if c.Media.Manifest {
		add(MediaManifest, Representation{}, nil, nil, "manifest", nil)
	}
	if len(p.Items) == 0 {
		return p, errors.New("没有可下载内容，请修改媒体配置")
	}
	canonical, _ := json.Marshal(p)
	p.Hash = digest(canonical)
	return p, nil
}

func appendUnique(values []string, value string) []string {
	for _, v := range values {
		if v == value {
			return values
		}
	}
	return append(values, value)
}
