package parsing

import (
	"errors"
	"net/url"
	"regexp"
	"strings"
	"unicode"

	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/notes"
)

var sharedURL = regexp.MustCompile(`https?://[^\s<>“”「」()（）]+`)
var objectID = regexp.MustCompile(`^[a-fA-F0-9]{24}$`)

// ExtractInputs preserves input order and duplicate origins. Deduplication takes
// place after expansion, when the real note ID and account context are known.
func ExtractInputs(text string) ([]string, error) {
	if len(text) > 1<<20 {
		return nil, errors.New("输入文本不能超过 1 MiB")
	}
	out := []string{}
	for _, line := range strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		links := sharedURL.FindAllString(line, -1)
		if len(links) == 0 {
			out = append(out, line)
		} else {
			for _, link := range links {
				out = append(out, strings.TrimRightFunc(link, func(r rune) bool { return unicode.IsPunct(r) && strings.ContainsRune("，。；;!！,.", r) }))
			}
		}
		if len(out) > 1000 {
			return nil, errors.New("每批最多 1000 条输入，请分批提交")
		}
	}
	if len(out) == 0 {
		return nil, errors.New("请输入笔记或用户链接")
	}
	return out, nil
}
func IsAllowedInput(input string) bool {
	if objectID.MatchString(input) {
		return true
	}
	u, err := url.Parse(input)
	if err != nil || u.User != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") {
		return false
	}
	h := strings.ToLower(u.Hostname())
	return h == "xiaohongshu.com" || strings.HasSuffix(h, ".xiaohongshu.com") || h == "xhslink.com" || h == "xhslink.cn"
}
func (c Config) Validate() error {
	if c.MaxPages < 1 || c.MaxPages > 10000 || c.MaxNotes < 0 || c.MaxNotes > 100000 || c.Concurrency < 1 || c.Concurrency > 16 {
		return errors.New("页数、笔记数量或解析并发无效")
	}
	if c.AccountMode != AccountFixed && c.AccountMode != AccountBySource {
		return errors.New("账号分配模式无效")
	}
	if c.CacheMode < UseFresh || c.CacheMode > CacheOnly || c.CacheTTLMS < 0 || c.CacheTTLMS > 86400000 {
		return errors.New("缓存配置无效")
	}
	if c.Kind < notes.KindUnknown || c.Kind > notes.KindVideo || c.LivePhoto < LiveAny || c.LivePhoto > LiveExclude || c.PublishedFromMS < 0 || c.PublishedUntilMS < 0 || (c.PublishedUntilMS > 0 && c.PublishedFromMS > c.PublishedUntilMS) {
		return errors.New("笔记筛选条件无效")
	}
	if len(c.TitleKeyword) > 256 {
		return errors.New("标题关键词过长")
	}
	return nil
}
func (c Config) Matches(n notes.Detail) bool {
	if c.Kind == notes.KindVideo && n.Note.Type != "video" {
		return false
	}
	if c.Kind == notes.KindImage && n.Note.Type != "normal" {
		return false
	}
	if n.Note.CreatedAtMS != nil {
		at := *n.Note.CreatedAtMS
		if (c.PublishedFromMS > 0 && at < c.PublishedFromMS) || (c.PublishedUntilMS > 0 && at > c.PublishedUntilMS) {
			return false
		}
	}
	if c.LivePhoto == LiveOnly && !n.Note.HasLivePhoto || c.LivePhoto == LiveExclude && n.Note.HasLivePhoto {
		return false
	}
	return c.TitleKeyword == "" || strings.Contains(strings.ToLower(n.Note.Title), strings.ToLower(c.TitleKeyword))
}
