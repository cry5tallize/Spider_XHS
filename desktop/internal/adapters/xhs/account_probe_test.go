package xhs

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/accounts"
	"github.com/cry5tallize/xhs_spider_desktop/internal/xhsapi"
)

type profileTransport struct {
	body     string
	requests []xhsapi.HTTPRequest
}

func (p *profileTransport) Close() error { return nil }
func (p *profileTransport) Do(_ context.Context, request xhsapi.HTTPRequest) (xhsapi.HTTPResponse, error) {
	p.requests = append(p.requests, request)
	return xhsapi.HTTPResponse{StatusCode: http.StatusOK, Headers: http.Header{}, URL: request.URL, Body: []byte(p.body)}, nil
}

func TestAccountProbeReadsProfileFromMe(t *testing.T) {
	for _, tc := range []struct{ name, profile, avatar string }{
		{"avatar", `{"user_id":"user-id","nickname":"真实昵称","images":"https://cdn.example.test/avatar.png"}`, "https://cdn.example.test/avatar.png"},
		{"missing avatar", `{"user_id":"user-id","nickname":"真实昵称"}`, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx := context.Background()
			sessions := NewSessions(ctx, &testCookies{version: 1, enabled: true})
			defer sessions.Close()
			transport := &profileTransport{body: `{"success":true,"code":0,"data":` + tc.profile + `}`}
			sessions.newClient = func(cookie string) (*xhsapi.Client, error) {
				return xhsapi.NewClient(cookie+"; gid=synthetic", xhsapi.Options{Transport: transport, APIOrigin: "https://api.example.test", DSL: "1790999998000"})
			}
			identity, status, version, err := (AccountProbe{Sessions: sessions}).CheckAccount(ctx, "account")
			if err != nil || status != accounts.Valid || version != 1 {
				t.Fatalf("validation: status=%v version=%v err=%v", status, version, err)
			}
			if identity.UserID != "user-id" || identity.Nickname != "真实昵称" || identity.AvatarURL != tc.avatar {
				t.Fatalf("profile: %+v", identity)
			}
			if len(transport.requests) != 1 || !strings.HasSuffix(transport.requests[0].URL, "/api/sns/web/v2/user/me") {
				t.Fatalf("unexpected profile requests: %d", len(transport.requests))
			}
		})
	}
}
