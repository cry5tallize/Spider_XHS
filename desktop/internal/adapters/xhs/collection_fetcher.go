package xhs

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/notes"
	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/parsing"
	"github.com/cry5tallize/xhs_spider_desktop/internal/xhsapi"
)

type CollectionFetcher struct {
	NoteFetcher
	client    *http.Client
	transport *http.Transport
}

func NewCollectionFetcher(s *Sessions) *CollectionFetcher {
	t := http.DefaultTransport.(*http.Transport).Clone()
	t.ResponseHeaderTimeout = 10 * time.Second
	t.MaxIdleConns = 4
	t.MaxIdleConnsPerHost = 2
	f := &CollectionFetcher{NoteFetcher: NoteFetcher{Sessions: s}, transport: t}
	f.client = &http.Client{Transport: t, Timeout: 15 * time.Second, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 5 || !parsing.IsAllowedInput(req.URL.String()) {
			return errors.New("invalid share redirect")
		}
		return nil
	}}
	return f
}
func (f *CollectionFetcher) Close() error { f.transport.CloseIdleConnections(); return nil }
func (f *CollectionFetcher) ExpandURL(ctx context.Context, input string) (string, error) {
	if !parsing.IsAllowedInput(input) {
		return "", &notes.Failure{Kind: notes.ErrorResponse, Message: "输入不是支持的小红书链接或 ID"}
	}
	u, err := url.Parse(input)
	if err != nil {
		return "", err
	}
	if u.Host == "" || strings.HasSuffix(strings.ToLower(u.Hostname()), "xiaohongshu.com") {
		return input, nil
	}
	req, err := http.NewRequestWithContext(ctx, "GET", input, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0")
	r, err := f.client.Do(req)
	if err != nil {
		return "", &notes.Failure{Kind: notes.ErrorNetwork, Message: "短链接展开失败，请使用完整链接", Retryable: true}
	}
	defer r.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(r.Body, 4096))
	final := r.Request.URL.String()
	if !parsing.IsAllowedInput(final) || strings.Contains(r.Request.URL.Hostname(), "xhslink") {
		return "", &notes.Failure{Kind: notes.ErrorResponse, Message: "短链接没有跳转到有效笔记或用户页面"}
	}
	return final, nil
}
func (f *CollectionFetcher) FetchUser(ctx context.Context, account, id string) (parsing.User, error) {
	l, err := f.Sessions.Acquire(ctx, account)
	if err != nil {
		return parsing.User{}, &notes.Failure{Kind: notes.ErrorAccount, Message: "账号不可用"}
	}
	defer l.Release()
	done, err := l.Request()
	if err != nil {
		return parsing.User{}, requestFailure(l.Context, err)
	}
	defer done()
	r, err := l.Client.GetUserInfo(l.Context, id)
	if err != nil {
		return parsing.User{}, requestFailure(l.Context, err)
	}
	var d struct {
		Basic struct {
			Nickname  string `json:"nickname"`
			Avatar    string `json:"images"`
			AvatarAlt string `json:"imageb"`
		} `json:"basic_info"`
	}
	if err = r.DecodeData(&d); err != nil {
		return parsing.User{}, &notes.Failure{Kind: notes.ErrorResponse, Message: "用户信息格式不完整"}
	}
	avatar := d.Basic.Avatar
	if avatar == "" {
		avatar = d.Basic.AvatarAlt
	}
	return parsing.User{ID: id, Nickname: d.Basic.Nickname, AvatarURL: avatar, Raw: r.Data, CredentialVersion: l.Version}, nil
}
func (f *CollectionFetcher) FetchUserPage(ctx context.Context, account string, ref xhsapi.UserRef, cursor string) (parsing.UserPage, error) {
	l, err := f.Sessions.Acquire(ctx, account)
	if err != nil {
		return parsing.UserPage{}, &notes.Failure{Kind: notes.ErrorAccount, Message: "账号不可用"}
	}
	defer l.Release()
	done, err := l.Request()
	if err != nil {
		return parsing.UserPage{}, requestFailure(l.Context, err)
	}
	defer done()
	r, err := l.Client.GetUserNotes(l.Context, ref.ID, xhsapi.UserNotesOptions{Num: 30, Cursor: cursor, Token: ref.Token, Source: ref.Source})
	if err != nil {
		return parsing.UserPage{}, requestFailure(l.Context, err)
	}
	return decodeUserPage(r, l.Version)
}
func decodeUserPage(r *xhsapi.Response, version int64) (parsing.UserPage, error) {
	var fields map[string]json.RawMessage
	if err := r.DecodeData(&fields); err != nil || len(fields["notes"]) == 0 || len(fields["has_more"]) == 0 {
		return parsing.UserPage{}, &notes.Failure{Kind: notes.ErrorResponse, Message: "用户列表缺少分页字段"}
	}
	p, err := r.Page("notes")
	if err != nil {
		return parsing.UserPage{}, &notes.Failure{Kind: notes.ErrorResponse, Message: "用户列表分页格式错误"}
	}
	out := parsing.UserPage{Cursor: p.Cursor, HasMore: p.HasMore, CredentialVersion: version, Notes: []parsing.UserNote{}}
	for _, raw := range p.Items {
		var item struct {
			ID       string `json:"note_id"`
			AltID    string `json:"id"`
			Title    string `json:"display_title"`
			AltTitle string `json:"title"`
			Type     string `json:"type"`
			Token    string `json:"xsec_token"`
			Source   string `json:"xsec_source"`
			Time     *int64 `json:"time"`
		}
		if err = json.Unmarshal(raw, &item); err != nil {
			return out, &notes.Failure{Kind: notes.ErrorResponse, Message: "用户笔记条目格式错误"}
		}
		if item.ID == "" {
			item.ID = item.AltID
		}
		if item.ID == "" {
			return out, &notes.Failure{Kind: notes.ErrorResponse, Message: "用户笔记条目缺少 ID"}
		}
		if item.Title == "" {
			item.Title = item.AltTitle
		}
		if item.Source == "" {
			item.Source = "pc_user"
		}
		out.Notes = append(out.Notes, parsing.UserNote{Ref: xhsapi.NoteRef{ID: item.ID, Token: item.Token, Source: item.Source}, Title: item.Title, RawKind: item.Type, PublishedAtMS: item.Time})
	}
	if out.HasMore && (out.Cursor == "" || len(out.Notes) == 0) {
		return out, &notes.Failure{Kind: notes.ErrorResponse, Message: "用户列表声称还有下一页但缺少条目或游标"}
	}
	return out, nil
}
