package xhsapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
)

var ErrRepeatedCursor = errors.New("pagination cursor repeated")
var ErrPageLimit = errors.New("pagination page limit reached")

func (r *Response) Page(itemsField string) (Page, error) {
	p := Page{Response: r}
	if r == nil {
		return p, fmt.Errorf("response is nil")
	}
	var data map[string]json.RawMessage
	if e := json.Unmarshal(r.Data, &data); e != nil {
		return p, e
	}
	if raw := data[itemsField]; len(raw) > 0 && string(raw) != "null" {
		if e := json.Unmarshal(raw, &p.Items); e != nil {
			return p, e
		}
	}
	if raw := data["cursor"]; len(raw) > 0 && string(raw) != "null" {
		if json.Unmarshal(raw, &p.Cursor) != nil {
			var n json.Number
			if e := json.Unmarshal(raw, &n); e != nil {
				return p, e
			}
			p.Cursor = string(n)
		}
	}
	if raw := data["has_more"]; len(raw) > 0 {
		if e := json.Unmarshal(raw, &p.HasMore); e != nil {
			return p, e
		}
	}
	return p, nil
}
func collect(ctx context.Context, options CollectOptions, fetch func(int, string) (*Response, error), itemsField, initialCursor string, useCursor bool) (Collection, error) {
	out := Collection{}
	if options.Limit < 0 || options.MaxPages < 0 {
		return out, fmt.Errorf("collection limits cannot be negative")
	}
	maxPages := options.MaxPages
	if maxPages == 0 {
		maxPages = 100
	}
	cursor := initialCursor
	seen := map[string]bool{}
	if cursor != "" {
		seen[cursor] = true
	}
	for page := 1; page <= maxPages; page++ {
		if e := ctx.Err(); e != nil {
			return out, e
		}
		r, e := fetch(page, cursor)
		if r != nil {
			out.Responses = append(out.Responses, r)
		}
		if e != nil {
			return out, e
		}
		p, e := r.Page(itemsField)
		if e != nil {
			return out, e
		}
		out.Items = append(out.Items, p.Items...)
		if options.Limit > 0 && len(out.Items) >= options.Limit {
			out.Items = out.Items[:options.Limit]
			return out, nil
		}
		if len(p.Items) == 0 || !p.HasMore {
			return out, nil
		}
		if useCursor {
			if p.Cursor == "" {
				return out, fmt.Errorf("has_more response is missing its next cursor")
			}
			if seen[p.Cursor] {
				return out, ErrRepeatedCursor
			}
			seen[p.Cursor] = true
			cursor = p.Cursor
		}
	}
	return out, ErrPageLimit
}
func collectCursor(ctx context.Context, o CollectOptions, fetch func(string) (*Response, error), itemsField, initial string) (Collection, error) {
	return collect(ctx, o, func(_ int, cursor string) (*Response, error) { return fetch(cursor) }, itemsField, initial, true)
}
func (c *Client) CollectUserNotes(ctx context.Context, userURL string, options CollectOptions) (Collection, error) {
	return c.collectUser(ctx, userURL, options, c.GetUserNotes)
}
func (c *Client) CollectUserLikedNotes(ctx context.Context, userURL string, options CollectOptions) (Collection, error) {
	return c.collectUser(ctx, userURL, options, c.GetUserLikedNotes)
}
func (c *Client) CollectUserCollectedNotes(ctx context.Context, userURL string, options CollectOptions) (Collection, error) {
	return c.collectUser(ctx, userURL, options, c.GetUserCollectedNotes)
}
func (c *Client) collectUser(ctx context.Context, userURL string, options CollectOptions, fetch func(context.Context, string, UserNotesOptions) (*Response, error)) (Collection, error) {
	ref, e := ParseUserURL(userURL)
	if e != nil {
		return Collection{}, e
	}
	return collectCursor(ctx, options, func(cursor string) (*Response, error) {
		return fetch(ctx, ref.ID, UserNotesOptions{Cursor: cursor, Token: ref.Token, Source: ref.Source})
	}, "notes", "")
}
func (c *Client) CollectHomefeed(ctx context.Context, category string, options CollectOptions) (Collection, error) {
	request := RecommendOptions{Category: category, RefreshType: 1}
	return collect(ctx, options, func(page int, _ string) (*Response, error) {
		r, e := c.GetHomefeed(ctx, request)
		if e == nil {
			var data struct {
				Cursor json.RawMessage `json:"cursor_score"`
			}
			if e = r.DecodeData(&data); e != nil {
				return r, e
			}
			if len(data.Cursor) > 0 {
				if json.Unmarshal(data.Cursor, &request.CursorScore) != nil {
					var n json.Number
					if json.Unmarshal(data.Cursor, &n) == nil {
						request.CursorScore = string(n)
					}
				}
			}
			request.RefreshType = 3
			request.NoteIndex = page * 20
		}
		return adaptHomefeed(r), e
	}, "items", "", false)
}
func adaptHomefeed(r *Response) *Response {
	if r == nil {
		return nil
	}
	var data map[string]json.RawMessage
	if json.Unmarshal(r.Data, &data) != nil {
		return r
	}
	if _, ok := data["has_more"]; ok {
		return r
	}
	// Homefeed historically has no has_more; use empty-page and caller limits.
	data["has_more"] = json.RawMessage(strconv.FormatBool(true))
	raw, e := json.Marshal(data)
	if e != nil {
		return r
	}
	copy := *r
	copy.Data = raw
	return &copy
}
