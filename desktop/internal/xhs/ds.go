package xhs

import (
	"context"
	"fmt"
	"regexp"
	"sync"
	"time"
)

var dsAnchorPattern = regexp.MustCompile(`function\s+getdss\s*\(\s*\)\s*\{\s*return\s+'(\d+)'`)

func ParseDSAnchor(script []byte) (string, error) {
	match := dsAnchorPattern.FindSubmatch(script)
	if len(match) != 2 {
		return "", fmt.Errorf("DS response does not contain getdss anchor")
	}
	return string(match[1]), nil
}

type dsFlight struct {
	done  chan struct{}
	value string
	err   error
}
type DSCache struct {
	mu      sync.Mutex
	fetch   func(context.Context) (string, error)
	clock   func() time.Time
	value   string
	fetched time.Time
	flight  *dsFlight
}

func NewDSCache(fetch func(context.Context) (string, error), clock func() time.Time) *DSCache {
	if clock == nil {
		clock = time.Now
	}
	return &DSCache{fetch: fetch, clock: clock}
}
func (c *DSCache) Get(ctx context.Context, force bool) (string, error) {
	if e := ctx.Err(); e != nil {
		return "", e
	}
	c.mu.Lock()
	if !force && c.value != "" && c.clock().Sub(c.fetched) < 5*time.Minute {
		value := c.value
		c.mu.Unlock()
		return value, nil
	}
	if flight := c.flight; flight != nil {
		c.mu.Unlock()
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-flight.done:
			return flight.value, flight.err
		}
	}
	f := &dsFlight{done: make(chan struct{})}
	c.flight = f
	started := c.clock()
	c.mu.Unlock()
	value, e := c.fetch(ctx)
	if e == nil && value == "" {
		e = fmt.Errorf("empty DS anchor")
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if e == nil {
		c.value = value
		c.fetched = started
	} else if c.value != "" && ctx.Err() == nil {
		value = c.value
		e = nil
	}
	f.value, f.err = value, e
	c.flight = nil
	close(f.done)
	return value, e
}
