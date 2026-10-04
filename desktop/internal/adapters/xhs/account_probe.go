package xhs

import (
	"context"
	"errors"

	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/accounts"
	core "github.com/cry5tallize/xhs_spider_desktop/internal/xhs"
	"github.com/cry5tallize/xhs_spider_desktop/internal/xhsapi"
)

type AccountProbe struct{ Sessions *Sessions }

func (AccountProbe) CheckCookie(raw string) error {
	if _, err := core.NewSession(raw, core.SessionOptions{}); err != nil {
		return errors.New("Cookie 格式错误，需要有效的 a1 和 web_session")
	}
	return nil
}

func (p AccountProbe) CheckAccount(ctx context.Context, id string) (accounts.Identity, accounts.Status, int64, error) {
	lease, err := p.Sessions.Acquire(ctx, id)
	if err != nil {
		return accounts.Identity{}, accounts.Error, 0, err
	}
	defer lease.Release()
	response, err := lease.Client.GetMe(lease.Context)
	if err != nil {
		if errors.Is(context.Cause(lease.Context), accounts.ErrChanged) {
			return accounts.Identity{}, accounts.Error, lease.Version, accounts.ErrChanged
		}
		var apiErr *xhsapi.APIError
		if errors.As(err, &apiErr) {
			if apiErr.StatusCode == 401 {
				return accounts.Identity{}, accounts.Expired, lease.Version, errors.New("Cookie 已失效，请更新")
			}
			if apiErr.StatusCode == 403 {
				return accounts.Identity{}, accounts.Restricted, lease.Version, errors.New("账号访问受限，请稍后重试")
			}
		}
		return accounts.Identity{}, accounts.Error, lease.Version, errors.New("账号校验失败，请检查网络或更新 Cookie")
	}
	var data struct {
		UserID   string `json:"user_id"`
		Nickname string `json:"nickname"`
	}
	if err = response.DecodeData(&data); err != nil {
		return accounts.Identity{}, accounts.Error, lease.Version, errors.New("账号响应无法解析")
	}
	return accounts.Identity{UserID: data.UserID, Nickname: data.Nickname}, accounts.Valid, lease.Version, nil
}
