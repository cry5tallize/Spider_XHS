package xhsapi

import (
	"context"
	"encoding/json"
)

func (c *Client) GetComments(ctx context.Context, ref NoteRef, cursor string) (*Response, error) {
	if e := required(ref.ID, "note ID"); e != nil {
		return nil, e
	}
	return c.get(ctx, API, "/api/sns/web/v2/comment/page", Params{{"note_id", ref.ID}, {"cursor", cursor}, {"top_comment_id", ""}, {"image_formats", "jpg,webp,avif"}, {"xsec_token", ref.Token}})
}
func (c *Client) GetSubComments(ctx context.Context, ref NoteRef, commentID, cursor string) (*Response, error) {
	if e := required(ref.ID, "note ID"); e != nil {
		return nil, e
	}
	if e := required(commentID, "root comment ID"); e != nil {
		return nil, e
	}
	return c.get(ctx, API, "/api/sns/web/v2/comment/sub/page", Params{{"note_id", ref.ID}, {"root_comment_id", commentID}, {"num", "10"}, {"cursor", cursor}, {"image_formats", "jpg,webp,avif"}, {"top_comment_id", ""}, {"xsec_token", ref.Token}})
}
func (c *Client) CollectComments(ctx context.Context, ref NoteRef, options CollectOptions) (Collection, error) {
	return collectCursor(ctx, options, func(cursor string) (*Response, error) { return c.GetComments(ctx, ref, cursor) }, "comments", "")
}
func (c *Client) CollectSubComments(ctx context.Context, ref NoteRef, commentID, cursor string, options CollectOptions) (Collection, error) {
	return collectCursor(ctx, options, func(cursor string) (*Response, error) { return c.GetSubComments(ctx, ref, commentID, cursor) }, "comments", cursor)
}
func (c *Client) GetAllComments(ctx context.Context, noteURL string, options CollectOptions) (CommentCollection, error) {
	ref, e := ParseNoteURL(noteURL)
	if e != nil {
		return CommentCollection{}, e
	}
	outer, e := c.CollectComments(ctx, ref, options)
	out := CommentCollection{Responses: outer.Responses}
	for _, raw := range outer.Items {
		var item struct {
			ID          string            `json:"id"`
			SubComments []json.RawMessage `json:"sub_comments"`
			HasMore     bool              `json:"sub_comment_has_more"`
			Cursor      string            `json:"sub_comment_cursor"`
		}
		if err := json.Unmarshal(raw, &item); err != nil {
			return out, err
		}
		out.Comments = append(out.Comments, Comment{Raw: raw, Replies: item.SubComments})
		if item.HasMore && item.ID != "" {
			children, err := c.CollectSubComments(ctx, ref, item.ID, item.Cursor, options)
			out.Responses = append(out.Responses, children.Responses...)
			last := len(out.Comments) - 1
			out.Comments[last].Replies = append(out.Comments[last].Replies, children.Items...)
			if err != nil {
				return out, err
			}
		}
	}
	return out, e
}
