package xhs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/accounts"
	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/notes"
	"github.com/cry5tallize/xhs_spider_desktop/internal/xhsapi"
)

type NoteFetcher struct{ Sessions *Sessions }

func (f NoteFetcher) FetchNote(ctx context.Context, account string, ref xhsapi.NoteRef) (notes.Payload, error) {
	lease, err := f.Sessions.Acquire(ctx, account)
	if err != nil {
		return notes.Payload{}, &notes.Failure{Kind: notes.ErrorAccount, Message: "账号不可用，请检查 Cookie 或启用状态"}
	}
	defer lease.Release()
	done, err := lease.Request()
	if err != nil {
		return notes.Payload{}, requestFailure(lease.Context, err)
	}
	defer done()
	response, err := lease.Client.GetNoteByID(lease.Context, ref)
	if err != nil {
		if errors.Is(context.Cause(lease.Context), accounts.ErrChanged) {
			return notes.Payload{}, &notes.Failure{Kind: notes.ErrorAccount, Message: "账号配置已变更，请重新解析", Retryable: true}
		}
		failure := &notes.Failure{Kind: notes.ErrorNetwork, Message: "请求失败，请检查网络后重试", Retryable: true}
		var apiErr *xhsapi.APIError
		if errors.As(err, &apiErr) {
			failure.HTTPStatus, failure.UpstreamCode = apiErr.StatusCode, apiErr.Code
			failure.Kind = notes.ErrorResponse
			failure.Message = fmt.Sprintf("小红书未返回可用详情（HTTP %d，code %d）", apiErr.StatusCode, apiErr.Code)
			switch apiErr.StatusCode {
			case 401:
				failure.Kind = notes.ErrorUnauthorized
				failure.Message = "Cookie 已失效，请更新后重试"
				failure.Retryable = false
			case 403:
				failure.Kind = notes.ErrorRestricted
				failure.Message = "账号访问受限，请稍后重试"
				failure.Retryable = false
			case 429:
				failure.Kind = notes.ErrorRateLimited
				failure.Message = "请求过于频繁，请稍后重试"
			}
		}
		return notes.Payload{}, failure
	}
	decoded, decodeErr := response.DecodeNotes()
	for _, note := range decoded {
		if note.ID == ref.ID {
			return notes.Payload{Note: note, Raw: response.Raw, Warnings: Warnings(decodeErr), AccountID: account, CredentialVersion: lease.Version}, nil
		}
	}
	return notes.Payload{}, &notes.Failure{Kind: notes.ErrorResponse, Message: "响应未包含目标笔记；请检查链接或账号权限"}
}

func requestFailure(ctx context.Context, err error) *notes.Failure {
	if errors.Is(context.Cause(ctx), accounts.ErrChanged) {
		return &notes.Failure{Kind: notes.ErrorAccount, Message: "账号配置已变更，请创建新的解析作业"}
	}
	f := &notes.Failure{Kind: notes.ErrorNetwork, Message: "请求失败，请检查网络后重试", Retryable: true}
	var apiErr *xhsapi.APIError
	if errors.As(err, &apiErr) {
		f.HTTPStatus = apiErr.StatusCode
		f.UpstreamCode = apiErr.Code
		f.Kind = notes.ErrorResponse
		f.Message = fmt.Sprintf("小红书未返回可用数据（HTTP %d，code %d）", apiErr.StatusCode, apiErr.Code)
		switch apiErr.StatusCode {
		case 401:
			f.Kind = notes.ErrorUnauthorized
			f.Message = "Cookie 已失效，请更新后新建作业"
			f.Retryable = false
		case 403:
			f.Kind = notes.ErrorRestricted
			f.Message = "账号访问受限，请稍后重试"
			f.Retryable = false
		case 429:
			f.Kind = notes.ErrorRateLimited
			f.Message = "请求过于频繁，作业已暂停"
		}
	}
	return f
}

// Warnings preserves every field-path warning instead of discarding partial results.
func Warnings(err error) []string {
	out := []string{}
	var visit func(error)
	visit = func(e error) {
		if e == nil {
			return
		}
		if group, ok := e.(interface{ Unwrap() []error }); ok {
			for _, child := range group.Unwrap() {
				visit(child)
			}
			return
		}
		out = append(out, e.Error())
	}
	visit(err)
	return out
}

// DecodeFixture accepts the canonical items array or a raw feed response.
func DecodeFixture(raw json.RawMessage) ([]notes.Payload, error) {
	var data struct {
		Data json.RawMessage `json:"data"`
	}
	var decoded []xhsapi.Note
	var err error
	if len(raw) > 0 && json.Unmarshal(raw, &data) == nil && len(data.Data) > 0 {
		decoded, err = (&xhsapi.Response{Data: data.Data}).DecodeNotes()
	} else {
		decoded, err = xhsapi.ParseNoteItems(raw)
	}
	out := make([]notes.Payload, 0, len(decoded))
	for _, n := range decoded {
		if n.ID == "" {
			continue
		}
		out = append(out, notes.Payload{Note: n, Raw: raw, Warnings: Warnings(err)})
	}
	if len(out) == 0 {
		return nil, errors.New("文件未包含可用笔记")
	}
	return out, nil
}
