package downloads

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"path/filepath"
	"strings"
	"unicode"

	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/notes"
	"github.com/cry5tallize/xhs_spider_desktop/internal/xhsapi"
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
		}
		p.Items = append(p.Items, PlannedItem{Sequence: len(p.Items) + 1, Kind: kind, AssetKey: key, Confidence: confidence, Representation: rep, RelativePath: filepath.Join(p.RelativeDirectory, name), URLs: urls, ExpectedBytes: size, Inline: body})
	}
	addStream := func(kind MediaKind, streams []xhsapi.VideoStream, index *int, label string) bool {
		for _, s := range streams {
			urls := URLs(s.URL, append([]string{s.MasterURL}, s.BackupURLs...)...)
			if len(urls) == 0 {
				continue
			}
			rep := Representation{CodecGroup: s.CodecGroup, Codec: s.Codec, Format: s.Format, Width: s.Width, Height: s.Height, FPS: s.FPS, ImageIndex: index}
			add(kind, rep, urls, s.SizeBytes, label, nil)
			return true
		}
		return false
	}
	if c.Media.Video && n.Type == "video" {
		if n.Video == nil || !addStream(MediaVideo, n.Video.Streams, nil, "video") {
			p.Warnings = append(p.Warnings, "笔记没有可用主视频地址")
		}
	}
	for _, image := range n.Images {
		index := image.Index + 1
		if (n.Type != "video" && c.Media.Images) || (n.Type == "video" && c.Media.VideoCover) {
			found := false
			for _, v := range image.Variants {
				urls := URLs(v.URL)
				if len(urls) == 0 {
					continue
				}
				rep := Representation{Scene: v.Scene, Format: v.Format, Width: v.Width, Height: v.Height, ImageIndex: &index}
				add(MediaImage, rep, urls, nil, fmt.Sprintf("image_%03d", index), nil)
				found = true
				break
			}
			if !found {
				p.Warnings = append(p.Warnings, fmt.Sprintf("图片 %d 没有可用地址", index))
			}
		}
		if c.Media.LivePhotoMotion && (len(image.MotionStreams) > 0 || (image.LivePhoto != nil && *image.LivePhoto)) {
			if !addStream(MediaMotion, image.MotionStreams, &index, fmt.Sprintf("motion_%03d", index)) {
				p.Warnings = append(p.Warnings, fmt.Sprintf("LivePhoto %d 没有动态视频地址", index))
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
