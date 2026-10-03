package xhs

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestDSCacheExpiryFallbackAndCancellation(t *testing.T) {
	var now atomic.Int64
	now.Store(fixtureNow)
	calls := 0
	fail := false
	c := NewDSCache(func(context.Context) (string, error) {
		calls++
		if fail {
			return "", errors.New("offline")
		}
		return "1790999998000", nil
	}, func() time.Time { return time.UnixMilli(now.Load()) })
	if v, e := c.Get(context.Background(), false); e != nil || v == "" {
		t.Fatalf("first fetch %s %v", v, e)
	}
	_, _ = c.Get(context.Background(), false)
	if calls != 1 {
		t.Fatal("cache miss within TTL")
	}
	now.Add(300000)
	_, _ = c.Get(context.Background(), false)
	if calls != 2 {
		t.Fatal("cache did not expire")
	}
	fail = true
	now.Add(300000)
	if v, e := c.Get(context.Background(), false); e != nil || v == "" {
		t.Fatal("old value not used on outage")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, e := c.Get(ctx, false); !errors.Is(e, context.Canceled) {
		t.Fatal("cancellation ignored")
	}
	c = NewDSCache(func(context.Context) (string, error) { return "", errors.New("offline") }, nil)
	if _, e := c.Get(context.Background(), false); e == nil {
		t.Fatal("first fetch failed silently")
	}
}
func TestDSCacheSharesFetch(t *testing.T) {
	start, release := make(chan struct{}), make(chan struct{})
	var calls atomic.Int32
	c := NewDSCache(func(context.Context) (string, error) {
		calls.Add(1)
		close(start)
		<-release
		return "1790999998000", nil
	}, nil)
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		if _, e := c.Get(context.Background(), false); e != nil {
			t.Error(e)
		}
	}()
	<-start
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, e := c.Get(ctx, false); !errors.Is(e, context.Canceled) {
		t.Fatal("waiter not cancelled")
	}
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, e := c.Get(context.Background(), false); e != nil {
				t.Error(e)
			}
		}()
	}
	close(release)
	wg.Wait()
	if calls.Load() != 1 {
		t.Fatal("concurrent callers fetched more than once")
	}
}
func TestDSAnchorParsing(t *testing.T) {
	value, e := ParseDSAnchor([]byte("function getdss() { return '1790999998000'; }; obfuscated()"))
	if e != nil || value != "1790999998000" {
		t.Fatal(value, e)
	}
	if _, e = ParseDSAnchor([]byte("not a DS program")); e == nil {
		t.Fatal("invalid response accepted")
	}
}
