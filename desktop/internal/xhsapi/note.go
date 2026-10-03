package xhsapi

import (
	"context"
	"fmt"
	"net/url"
	"regexp"
	"strings"
)

var objectID = regexp.MustCompile(`^[0-9a-fA-F]{24}$`)

func linkRef(input string) (string, url.Values, error) {
	if objectID.MatchString(input) {
		return input, nil, nil
	}
	u, e := url.Parse(input)
	if e != nil || (u.Scheme != "https" && u.Scheme != "http") {
		return "", nil, fmt.Errorf("use a complete xiaohongshu URL or 24-character ID")
	}
	host := strings.ToLower(u.Hostname())
	if host != "xiaohongshu.com" && !strings.HasSuffix(host, ".xiaohongshu.com") {
		return "", nil, fmt.Errorf("use the full xiaohongshu URL; short links must be expanded first")
	}
	parts := strings.Split(strings.TrimRight(u.Path, "/"), "/")
	id := parts[len(parts)-1]
	if !objectID.MatchString(id) {
		return "", nil, fmt.Errorf("URL does not contain a valid ID")
	}
	return id, u.Query(), nil
}
func lastQuery(q url.Values, name string) string {
	values := q[name]
	if len(values) == 0 {
		return ""
	}
	return values[len(values)-1]
}
func ParseNoteURL(input string) (NoteRef, error) {
	id, q, e := linkRef(input)
	if e != nil {
		return NoteRef{}, e
	}
	source := lastQuery(q, "xsec_source")
	if source == "" {
		source = "pc_search"
	}
	return NoteRef{id, lastQuery(q, "xsec_token"), source}, nil
}
func ParseUserURL(input string) (UserRef, error) {
	id, q, e := linkRef(input)
	if e != nil {
		return UserRef{}, e
	}
	source := lastQuery(q, "xsec_source")
	if source == "" {
		source = "pc_search"
	}
	return UserRef{id, lastQuery(q, "xsec_token"), source}, nil
}

func (c *Client) GetNote(ctx context.Context, noteURL string) (*Response, error) {
	ref, e := ParseNoteURL(noteURL)
	if e != nil {
		return nil, e
	}
	return c.GetNoteByID(ctx, ref)
}

func (c *Client) GetNoteByID(ctx context.Context, ref NoteRef) (*Response, error) {
	if e := required(ref.ID, "note ID"); e != nil {
		return nil, e
	}
	if e := c.ensureAccount(ctx); e != nil {
		return nil, e
	}
	source := ref.Source
	if source == "" {
		source = "pc_search"
	}
	return c.post(ctx, API, "/api/sns/web/v1/feed", Params{{"source_note_id", ref.ID}, {"image_formats", []string{"jpg", "webp", "avif"}}, {"extra", Params{{"need_body_topic", "1"}}}, {"xsec_source", source}, {"xsec_token", ref.Token}})
}
func (c *Client) GetHomefeedChannels(ctx context.Context) (*Response, error) {
	return c.get(ctx, API, "/api/sns/web/v1/homefeed/category", nil)
}
func (c *Client) GetHomefeed(ctx context.Context, options RecommendOptions) (*Response, error) {
	if e := required(options.Category, "category"); e != nil {
		return nil, e
	}
	if e := c.ensureAccount(ctx); e != nil {
		return nil, e
	}
	if options.Num == 0 {
		options.Num = 20
	}
	if options.NeedNum == 0 {
		options.NeedNum = 10
	}
	if options.RefreshType == 0 {
		options.RefreshType = 1
	}
	if options.Num < 1 || options.NeedNum < 1 || options.NoteIndex < 0 {
		return nil, fmt.Errorf("invalid recommendation options")
	}
	return c.post(ctx, API, "/api/sns/web/v1/homefeed", Params{{"cursor_score", options.CursorScore}, {"num", options.Num}, {"refresh_type", options.RefreshType}, {"note_index", options.NoteIndex}, {"unread_begin_note_id", ""}, {"unread_end_note_id", ""}, {"unread_note_count", 0}, {"category", options.Category}, {"search_key", ""}, {"need_num", options.NeedNum}, {"image_formats", []string{"jpg", "webp", "avif"}}, {"need_filter_image", false}})
}
func (c *Client) ShareCode(ctx context.Context, noteID string) (*Response, error) {
	if e := required(noteID, "note ID"); e != nil {
		return nil, e
	}
	return c.post(ctx, API, "/api/sns/web/share/code", Params{{"share_code", Params{{"id", noteID}}}})
}
func (c *Client) GetWidgets(ctx context.Context, noteID string, options WidgetsOptions) (*Response, error) {
	if e := required(noteID, "note ID"); e != nil {
		return nil, e
	}
	if options.Source == "" {
		options.Source = "web_feed"
	}
	if options.Mode == 0 {
		options.Mode = 1
	}
	if options.ExpFlags == nil {
		options.ExpFlags = Params{{"web_support_related_search", true}}
	}
	return c.post(ctx, API, "/api/sns/web/v2/widgets", Params{{"note_id", noteID}, {"scene", "web"}, {"mode", options.Mode}, {"source", options.Source}, {"exp_flags", options.ExpFlags}})
}
func (c *Client) WorldcupNoteSEO(ctx context.Context, noteIDs []string) (*Response, error) {
	if len(noteIDs) == 0 {
		return nil, fmt.Errorf("note IDs required")
	}
	return c.post(ctx, API, "/api/sns/web/worldcup/note/seo", Params{{"note_ids", noteIDs}})
}
func requireFields(body Params, names ...string) error {
	for _, name := range names {
		found := false
		for _, field := range body {
			if field.Name == name {
				found = true
				break
			}
		}
		if !found {
			return fmt.Errorf("captured field %s required", name)
		}
	}
	return nil
}
func (c *Client) ReportNoteMetrics(ctx context.Context, body Params) (*Response, error) {
	if e := requireFields(body, "note_id", "note_type", "report_type", "stress_test", "trace", "viewer", "author", "interaction", "note", "other"); e != nil {
		return nil, e
	}
	return c.post(ctx, API, "/api/sns/web/v1/note/metrics_report", body)
}
func (c *Client) ReportHistory(ctx context.Context, body Params) (*Response, error) {
	if e := requireFields(body, "events", "extra_map"); e != nil {
		return nil, e
	}
	return c.call(ctx, API, "POST", "/api/sns/v1/history/report_web", nil, body, []Header{{"content-type", "application/json"}}, false)
}
