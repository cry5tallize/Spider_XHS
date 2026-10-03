package xhsapi

import (
	"context"
	"fmt"
)

func (c *Client) GetMe(ctx context.Context) (*Response, error) {
	r, e := c.get(ctx, API, "/api/sns/web/v2/user/me", nil)
	if e != nil {
		return r, e
	}
	var data struct {
		UserID string `json:"user_id"`
	}
	if e = r.DecodeData(&data); e != nil {
		return r, e
	}
	if data.UserID == "" {
		return r, fmt.Errorf("user/me did not return user_id")
	}
	c.session.SetUserID(data.UserID)
	return r, nil
}
func (c *Client) Bootstrap(ctx context.Context) error { _, e := c.GetMe(ctx); return e }
func (c *Client) GetUserInfo(ctx context.Context, userID string) (*Response, error) {
	if e := required(userID, "user ID"); e != nil {
		return nil, e
	}
	return c.get(ctx, API, "/api/sns/web/v1/user/otherinfo", Params{{"target_user_id", userID}})
}
func (c *Client) userNotes(ctx context.Context, path, userID string, options UserNotesOptions) (*Response, error) {
	if e := required(userID, "user ID"); e != nil {
		return nil, e
	}
	if options.Num == 0 {
		options.Num = 30
	}
	if options.Num < 1 {
		return nil, fmt.Errorf("num must be positive")
	}
	return c.get(ctx, API, path, Params{{"num", options.Num}, {"cursor", options.Cursor}, {"user_id", userID}, {"image_formats", "jpg,webp,avif"}, {"xsec_token", options.Token}, {"xsec_source", options.Source}})
}
func (c *Client) GetUserNotes(ctx context.Context, userID string, options UserNotesOptions) (*Response, error) {
	return c.userNotes(ctx, "/api/sns/web/v1/user_posted", userID, options)
}
func (c *Client) GetUserLikedNotes(ctx context.Context, userID string, options UserNotesOptions) (*Response, error) {
	return c.userNotes(ctx, "/api/sns/web/v1/note/like/page", userID, options)
}
func (c *Client) GetUserCollectedNotes(ctx context.Context, userID string, options UserNotesOptions) (*Response, error) {
	return c.userNotes(ctx, "/api/sns/web/v2/note/collect/page", userID, options)
}
func (c *Client) GetUserBoards(ctx context.Context, userID string, num, page int) (*Response, error) {
	if e := required(userID, "user ID"); e != nil {
		return nil, e
	}
	if num == 0 {
		num = 15
	}
	if page == 0 {
		page = 1
	}
	if num < 1 || page < 1 {
		return nil, fmt.Errorf("invalid board pagination")
	}
	return c.get(ctx, API, "/api/sns/web/v1/board/user", Params{{"user_id", userID}, {"num", num}, {"page", page}})
}
