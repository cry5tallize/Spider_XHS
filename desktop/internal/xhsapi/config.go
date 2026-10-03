package xhsapi

import "context"

func (c *Client) GetWebConfig(ctx context.Context) (*Response, error) {
	return c.post(ctx, API, "/api/sns/web/v1/config", nil)
}
func (c *Client) GetSystemConfig(ctx context.Context) (*Response, error) {
	return c.get(ctx, API, "/api/sns/web/v1/system/config", nil)
}
func (c *Client) GetGlobalConfig(ctx context.Context) (*Response, error) {
	return c.get(ctx, API, "/api/sns/web/global/config", nil)
}
func (c *Client) GetWorldcupDisplayPeriod(ctx context.Context) (*Response, error) {
	return c.get(ctx, API, "/api/sns/web/worldcup/dots/display_period", nil)
}
func (c *Client) GetDQARecommend(ctx context.Context, source string) (*Response, error) {
	if source == "" {
		source = "diandian"
	}
	return c.get(ctx, Search, "/api/sns/web/v1/dqa/recommend/query", Params{{"source", source}})
}
func (c *Client) GetTrendingQueries(ctx context.Context, o TrendingOptions) (*Response, error) {
	if o.Source == "" {
		o.Source = "UserPage"
	}
	if o.SearchType == "" {
		o.SearchType = "trend"
	}
	if o.Situation == "" {
		o.Situation = "FIRST_ENTER"
	}
	return c.get(ctx, API, "/api/sns/web/v1/search/trending/query", Params{{"source", o.Source}, {"search_type", o.SearchType}, {"last_query", o.LastQuery}, {"last_query_time", o.LastQueryTime}, {"word_request_situation", o.Situation}, {"hint_word", o.HintWord}, {"hint_word_type", o.HintWordType}, {"hint_word_request_id", o.HintWordRequestID}})
}
