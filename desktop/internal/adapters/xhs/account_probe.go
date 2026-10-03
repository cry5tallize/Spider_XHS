package xhs

import (
	"context"
	"errors"

	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/accounts"
	core "github.com/cry5tallize/xhs_spider_desktop/internal/xhs"
	"github.com/cry5tallize/xhs_spider_desktop/internal/xhsapi"
)

type AccountProbe struct{}

func (AccountProbe) CheckCookie(raw string) error {
	if _, err := core.NewSession(raw, core.SessionOptions{}); err != nil {
		return errors.New("Cookie 格式错误，需要有效的 a1 和 web_session")
	}
	return nil
}

func (AccountProbe) CheckAccount(ctx context.Context, cookie string) (accounts.Identity, accounts.Status, error) {
	client, err := xhsapi.NewClient(cookie, xhsapi.Options{})
	if err != nil {
		return accounts.Identity{}, accounts.Error, errors.New("无法创建账号会话，请更新 Cookie")
	}
	defer client.Close()
	response, err := client.GetMe(ctx)
	if err != nil {
		var apiErr *xhsapi.APIError
		if errors.As(err, &apiErr) {
			if apiErr.StatusCode == 401 {
				return accounts.Identity{}, accounts.Expired, errors.New("Cookie 已失效，请更新")
			}
			if apiErr.StatusCode == 403 {
				return accounts.Identity{}, accounts.Restricted, errors.New("账号访问受限，请稍后重试")
			}
		}
		return accounts.Identity{}, accounts.Error, errors.New("账号校验失败，请检查网络或更新 Cookie")
	}
	var data struct {
		UserID   string `json:"user_id"`
		Nickname string `json:"nickname"`
	}
	if err = response.DecodeData(&data); err != nil {
		return accounts.Identity{}, accounts.Error, errors.New("账号响应无法解析")
	}
	return accounts.Identity{UserID: data.UserID, Nickname: data.Nickname}, accounts.Valid, nil
}
