package xhsapi

import "context"

func (c *Client) GetUnread(ctx context.Context) (*Response, error) {
	return c.get(ctx, API, "/api/sns/web/unread_count", nil)
}
func (c *Client) GetMentions(ctx context.Context, cursor string) (*Response, error) {
	return c.get(ctx, API, "/api/sns/web/v1/you/mentions", Params{{"num", "20"}, {"cursor", cursor}})
}
func (c *Client) GetLikesAndCollections(ctx context.Context, cursor string) (*Response, error) {
	return c.get(ctx, API, "/api/sns/web/v1/you/likes", Params{{"num", "20"}, {"cursor", cursor}})
}
func (c *Client) GetNewConnections(ctx context.Context, cursor string) (*Response, error) {
	return c.get(ctx, API, "/api/sns/web/v1/you/connections", Params{{"num", "20"}, {"cursor", cursor}})
}
func (c *Client) CollectMentions(ctx context.Context, o CollectOptions) (Collection, error) {
	return collectCursor(ctx, o, func(cursor string) (*Response, error) { return c.GetMentions(ctx, cursor) }, "message_list", "")
}
func (c *Client) CollectLikesAndCollections(ctx context.Context, o CollectOptions) (Collection, error) {
	return collectCursor(ctx, o, func(cursor string) (*Response, error) { return c.GetLikesAndCollections(ctx, cursor) }, "message_list", "")
}
func (c *Client) CollectNewConnections(ctx context.Context, o CollectOptions) (Collection, error) {
	return collectCursor(ctx, o, func(cursor string) (*Response, error) { return c.GetNewConnections(ctx, cursor) }, "message_list", "")
}
