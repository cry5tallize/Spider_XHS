package xhsapi

import (
	"context"
	"fmt"
)

func (c *Client) NewSearchID() (string, error) {
	id, _, e := c.searchIDs(c.clock().UnixMilli())
	return id, e
}

func (c *Client) SearchNotes(ctx context.Context, keyword string, o SearchNotesOptions) (*Response, error) {
	if e := required(keyword, "keyword"); e != nil {
		return nil, e
	}
	if o.Page == 0 {
		o.Page = 1
	}
	if o.PageSize == 0 {
		o.PageSize = 20
	}
	if o.Sort == "" {
		o.Sort = SortGeneral
	}
	if o.Page < 1 || o.PageSize < 1 || o.NoteType < NoteAll || o.NoteType > NoteImage || o.NoteTime < 0 || o.NoteTime > 3 || o.NoteRange < 0 || o.NoteRange > 3 || o.Distance < 0 || o.Distance > 2 {
		return nil, fmt.Errorf("invalid search options")
	}
	switch o.Sort {
	case SortGeneral, SortLatest, SortLikes, SortComments, SortCollections:
	default:
		return nil, fmt.Errorf("unknown sort %q", o.Sort)
	}
	if o.SearchID == "" {
		id, _, e := c.searchIDs(c.clock().UnixMilli())
		if e != nil {
			return nil, e
		}
		o.SearchID = id
	}
	if o.SessionID == "" {
		id, e := c.newUUID()
		if e != nil {
			return nil, e
		}
		o.SessionID = id
	}
	body := Params{{"keyword", keyword}, {"page", o.Page}, {"page_size", o.PageSize}, {"search_id", o.SearchID}, {"sort", string(o.Sort)}, {"note_type", int(o.NoteType)}, {"ext_flags", []any{}}, {"geo", o.Geo}, {"image_formats", []string{"jpg", "webp", "avif"}}, {"session_id", o.SessionID}}
	if o.NoteTime != 0 || o.NoteRange != 0 || o.Distance != 0 {
		filters := []any{Params{{"tags", []string{string(o.Sort)}}, {"type", "sort_type"}}, Params{{"tags", []string{[]string{"不限", "视频笔记", "普通笔记"}[o.NoteType]}}, {"type", "filter_note_type"}}, Params{{"tags", []string{[]string{"不限", "一天内", "一周内", "半年内"}[o.NoteTime]}}, {"type", "filter_note_time"}}, Params{{"tags", []string{[]string{"不限", "已看过", "未看过", "已关注"}[o.NoteRange]}}, {"type", "filter_note_range"}}, Params{{"tags", []string{[]string{"不限", "同城", "附近"}[o.Distance]}}, {"type", "filter_pos_distance"}}}
		body = append(body, Param{"filters", filters})
	}
	return c.post(ctx, Search, "/api/sns/web/v2/search/notes", body)
}
func (c *Client) SearchUsers(ctx context.Context, keyword string, o SearchUsersOptions) (*Response, error) {
	if e := required(keyword, "keyword"); e != nil {
		return nil, e
	}
	if o.Page == 0 {
		o.Page = 1
	}
	if o.PageSize == 0 {
		o.PageSize = 15
	}
	if o.Page < 1 || o.PageSize < 1 {
		return nil, fmt.Errorf("invalid user search pagination")
	}
	if o.SearchID == "" || o.RequestID == "" {
		id, request, e := c.searchIDs(c.clock().UnixMilli())
		if e != nil {
			return nil, e
		}
		if o.SearchID == "" {
			o.SearchID = id
		}
		if o.RequestID == "" {
			o.RequestID = request
		}
	}
	return c.post(ctx, API, "/api/sns/web/v1/search/usersearch", Params{{"search_user_request", Params{{"keyword", keyword}, {"search_id", o.SearchID}, {"page", o.Page}, {"page_size", o.PageSize}, {"biz_type", "web_search_user"}, {"request_id", o.RequestID}}}})
}
func (c *Client) SearchOnebox(ctx context.Context, keyword string, o OneboxOptions) (*Response, error) {
	if e := required(keyword, "keyword"); e != nil {
		return nil, e
	}
	if o.BizType == "" {
		o.BizType = "web_search_user"
	}
	if o.SearchID == "" || o.RequestID == "" {
		id, request, e := c.searchIDs(c.clock().UnixMilli())
		if e != nil {
			return nil, e
		}
		if o.SearchID == "" {
			o.SearchID = id
		}
		if o.RequestID == "" {
			o.RequestID = request
		}
	}
	return c.post(ctx, API, "/api/sns/web/v1/search/onebox", Params{{"keyword", keyword}, {"search_id", o.SearchID}, {"biz_type", o.BizType}, {"request_id", o.RequestID}})
}
func (c *Client) GetSearchFilters(ctx context.Context, keyword, searchID string) (*Response, error) {
	if e := required(searchID, "search ID"); e != nil {
		return nil, e
	}
	return c.get(ctx, API, "/api/sns/web/v1/search/filter", Params{{"keyword", keyword}, {"search_id", searchID}})
}
func (c *Client) GetSearchKeywords(ctx context.Context, keyword string) (*Response, error) {
	if e := required(keyword, "keyword"); e != nil {
		return nil, e
	}
	return c.get(ctx, API, "/api/sns/web/v1/search/recommend", Params{{"keyword", keyword}})
}

// SyncSearchHistory is an explicit write; searches do not call it automatically.
func (c *Client) SyncSearchHistory(ctx context.Context, keyword string, clientTime int64) (*Response, error) {
	if clientTime == 0 {
		clientTime = c.clock().UnixMilli()
	}
	return c.SyncSearchHistoryCaptured(ctx, clientTime, []any{Params{{"act", "search"}, {"q", keyword}, {"ct", clientTime}}})
}
func (c *Client) SyncSearchHistoryCaptured(ctx context.Context, clientTime int64, ops []any) (*Response, error) {
	if ops == nil {
		return nil, fmt.Errorf("ops must be an explicit list (empty allowed)")
	}
	return c.post(ctx, Search, "/api/sns/web/search/history/sync", Params{{"client_time", clientTime}, {"ops", ops}})
}
func (c *Client) CollectSearchNotes(ctx context.Context, keyword string, o SearchNotesOptions, limits CollectOptions) (Collection, error) {
	if o.SearchID == "" {
		id, _, e := c.searchIDs(c.clock().UnixMilli())
		if e != nil {
			return Collection{}, e
		}
		o.SearchID = id
	}
	start := o.Page
	if start == 0 {
		start = 1
	}
	return collect(ctx, limits, func(page int, _ string) (*Response, error) {
		request := o
		request.Page = start + page - 1
		return c.SearchNotes(ctx, keyword, request)
	}, "items", "", false)
}
func (c *Client) CollectSearchUsers(ctx context.Context, keyword string, o SearchUsersOptions, limits CollectOptions) (Collection, error) {
	start := o.Page
	if start == 0 {
		start = 1
	}
	return collect(ctx, limits, func(page int, _ string) (*Response, error) {
		request := o
		request.Page = start + page - 1
		return c.SearchUsers(ctx, keyword, request)
	}, "users", "", false)
}
