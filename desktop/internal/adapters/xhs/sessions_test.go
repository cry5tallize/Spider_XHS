package xhs

import (
	"context"
	"errors"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/accounts"
	"github.com/cry5tallize/xhs_spider_desktop/internal/xhsapi"
)

type testCookies struct {
	version     int64
	enabled     bool
	decryptions int
}

func (c *testCookies) SessionAccount(context.Context, string) (accounts.Account, error) {
	return accounts.Account{Enabled: c.enabled, HasCookie: true, CredentialVersion: c.version}, nil
}
func (c *testCookies) ReadCookie(context.Context, string) (string, int64, error) {
	c.decryptions++
	return "a1=" + strings.Repeat("0", 52) + "; web_session=offline-only", c.version, nil
}

type idleTransport struct{ closes atomic.Int32 }

func (t *idleTransport) Close() error { t.closes.Add(1); return nil }
func (t *idleTransport) Do(context.Context, xhsapi.HTTPRequest) (xhsapi.HTTPResponse, error) {
	return xhsapi.HTTPResponse{}, errors.New("unexpected HTTP request")
}

func TestSessionReuseRotationCancellationAndDrain(t *testing.T) {
	ctx := context.Background()
	source := &testCookies{version: 1, enabled: true}
	s := NewSessions(ctx, source)
	defer s.Close()
	transports := []*idleTransport{}
	s.newClient = func(cookie string) (*xhsapi.Client, error) {
		tr := &idleTransport{}
		transports = append(transports, tr)
		return xhsapi.NewClient(cookie, xhsapi.Options{Transport: tr})
	}
	first, err := s.Acquire(ctx, "account")
	if err != nil {
		t.Fatal(err)
	}
	second, err := s.Acquire(ctx, "account")
	if err != nil {
		t.Fatal(err)
	}
	if first.Client != second.Client || source.decryptions != 1 {
		t.Fatal("client was not reused")
	}
	source.version = 2
	s.Invalidate("account")
	select {
	case <-first.Context.Done():
	case <-time.After(time.Second):
		t.Fatal("retired request not canceled")
	}
	if !errors.Is(context.Cause(first.Context), accounts.ErrChanged) {
		t.Fatal("missing credential rotation cause")
	}
	if transports[0].closes.Load() != 0 {
		t.Fatal("closed an active transport")
	}
	third, err := s.Acquire(ctx, "account")
	if err != nil {
		t.Fatal(err)
	}
	if third.Client == first.Client || third.Version != 2 {
		t.Fatal("old credential reused")
	}
	first.Release()
	first.Release()
	if transports[0].closes.Load() != 0 {
		t.Fatal("second lease still active")
	}
	second.Release()
	if transports[0].closes.Load() != 1 {
		t.Fatal("retired client not closed once")
	}
	source.enabled = false
	s.Invalidate("account")
	if _, err = s.Acquire(ctx, "account"); !errors.Is(err, accounts.ErrDisabled) {
		t.Fatal("disabled account accepted")
	}
	third.Release()
	if err = s.Close(); err != nil {
		t.Fatal(err)
	}
	for _, tr := range transports {
		if tr.closes.Load() != 1 {
			t.Fatal("transport leak or double close")
		}
	}
}
