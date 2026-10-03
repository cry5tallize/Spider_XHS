package xhsapi

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/cry5tallize/xhs_spider_desktop/internal/xhs"
)

type Client struct {
	core                *xhs.Client
	session             *xhs.Session
	options             Options
	clock               func() time.Time
	random              io.Reader
	randMu, bootstrapMu sync.Mutex
	closeOnce           sync.Once
	closeErr            error
}

func NewClient(cookie string, options Options) (*Client, error) {
	if options.APIOrigin == "" {
		options.APIOrigin = xhs.APIOrigin
	}
	if options.SearchOrigin == "" {
		options.SearchOrigin = xhs.SearchOrigin
	}
	if options.WebOrigin == "" {
		options.WebOrigin = "https://www.xiaohongshu.com"
	}
	for _, origin := range []string{options.APIOrigin, options.SearchOrigin, options.WebOrigin} {
		u, e := url.Parse(origin)
		if e != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") {
			return nil, fmt.Errorf("invalid endpoint origin")
		}
	}
	clock := options.Clock
	if clock == nil {
		clock = time.Now
	}
	random := options.Random
	if random == nil {
		random = rand.Reader
	}
	session, e := xhs.NewSession(cookie, xhs.SessionOptions{Clock: clock, DSL: options.DSL, SourceURL: options.APIOrigin})
	if e != nil {
		return nil, e
	}
	var transport xhs.Transport
	if options.Transport != nil {
		transport = &transportAdapter{options.Transport}
	} else {
		transport, e = xhs.NewChromeTransport(xhs.TransportOptions{ProxyURL: options.ProxyURL, Timeout: options.Timeout})
		if e != nil {
			return nil, e
		}
	}
	return &Client{core: xhs.NewClientAt(session, transport, options.APIOrigin), session: session, options: options, clock: clock, random: random}, nil
}
func (c *Client) Close() error {
	c.closeOnce.Do(func() { c.closeErr = c.core.Close() })
	return c.closeErr
}
func (c *Client) UserID() string { return c.session.Snapshot().UserID }
func (c *Client) ensureAccount(ctx context.Context) error {
	if c.UserID() != "" {
		return nil
	}
	c.bootstrapMu.Lock()
	defer c.bootstrapMu.Unlock()
	if c.UserID() != "" {
		return nil
	}
	_, e := c.GetMe(ctx)
	return e
}

type transportAdapter struct{ Transport }

func (t *transportAdapter) Do(ctx context.Context, r xhs.PreparedRequest) (xhs.Response, error) {
	headers := make([]Header, len(r.Headers))
	for i, h := range r.Headers {
		headers[i] = Header{h.Name, h.Value}
	}
	response, e := t.Transport.Do(ctx, HTTPRequest{r.Method, r.URL, headers, append([]byte(nil), r.Body...)})
	if e != nil {
		return xhs.Response{}, e
	}
	cookieResponse := http.Response{Header: response.Headers}
	cookies := []xhs.CookieUpdate{}
	for _, cookie := range cookieResponse.Cookies() {
		cookies = append(cookies, xhs.CookieUpdate{Name: cookie.Name, Value: cookie.Value, Delete: cookie.MaxAge < 0 || (!cookie.Expires.IsZero() && cookie.Expires.Before(time.Now()))})
	}
	return xhs.Response{StatusCode: response.StatusCode, Headers: response.Headers, Body: response.Body, Cookies: cookies, URL: response.URL, Protocol: response.Protocol}, nil
}
func (c *Client) origin(endpoint Endpoint) (string, error) {
	switch endpoint {
	case API:
		return c.options.APIOrigin, nil
	case Search:
		return c.options.SearchOrigin, nil
	case Web:
		return c.options.WebOrigin, nil
	default:
		return "", fmt.Errorf("unknown endpoint %q", endpoint)
	}
}
func coreParams(params Params) (xhs.Object, error) {
	o := xhs.Object{}
	for _, p := range params {
		v, e := coreValue(p.Value)
		if e != nil {
			return nil, e
		}
		o = append(o, xhs.Field{Name: p.Name, Value: v})
	}
	return o, nil
}
func coreValue(value any) (any, error) {
	switch v := value.(type) {
	case Params:
		return coreParams(v)
	case []any:
		out := make([]any, len(v))
		for i, x := range v {
			converted, e := coreValue(x)
			if e != nil {
				return nil, e
			}
			out[i] = converted
		}
		return out, nil
	case json.RawMessage:
		return xhs.ParseJSON(v)
	case map[string]any:
		return nil, fmt.Errorf("use Params rather than a map for signed fields")
	default:
		return v, nil
	}
}

func (c *Client) get(ctx context.Context, endpoint Endpoint, path string, query Params) (*Response, error) {
	return c.call(ctx, endpoint, "GET", path, query, nil, nil, false)
}
func (c *Client) post(ctx context.Context, endpoint Endpoint, path string, body Params) (*Response, error) {
	return c.call(ctx, endpoint, "POST", path, nil, body, nil, false)
}
func (c *Client) call(ctx context.Context, endpoint Endpoint, method, path string, query, body Params, headers []Header, unsigned bool) (*Response, error) {
	origin, e := c.origin(endpoint)
	if e != nil {
		return nil, e
	}
	api := path
	if len(query) > 0 {
		values, e := coreParams(query)
		if e != nil {
			return nil, e
		}
		api, e = xhs.SpliceQuery(path, values)
		if e != nil {
			return nil, e
		}
	}
	wireBody := xhs.Body{}
	if body != nil {
		values, e := coreParams(body)
		if e != nil {
			return nil, e
		}
		wireBody, e = xhs.JSONBody(values)
		if e != nil {
			return nil, e
		}
	}
	extra := xhs.Headers{}
	for _, h := range headers {
		extra = append(extra, xhs.Header{Name: h.Name, Value: h.Value})
	}
	start := time.Now()
	raw, e := c.core.Execute(ctx, xhs.RequestSpec{Method: method, Origin: origin, Path: api, Body: wireBody, ExtraHeaders: extra, Unsigned: unsigned, WithCookies: unsigned && endpoint == Web})
	if e != nil {
		return nil, e
	}
	response := &Response{Raw: append(json.RawMessage(nil), raw.Body...), StatusCode: raw.StatusCode, Headers: raw.Headers.Clone(), Method: method, Path: path, Endpoint: endpoint, Duration: time.Since(start)}
	if !unsigned {
		e = decodeResponse(response)
	} else if raw.StatusCode < 200 || raw.StatusCode >= 300 {
		e = &APIError{StatusCode: raw.StatusCode, Message: "public page request failed"}
	}
	if c.options.OnResponse != nil {
		if observerError := c.options.OnResponse(response); observerError != nil {
			e = errors.Join(e, fmt.Errorf("response capture: %w", observerError))
		}
	}
	return response, e
}
func decodeResponse(response *Response) error {
	var root map[string]json.RawMessage
	if e := json.Unmarshal(response.Raw, &root); e != nil {
		return &DecodeError{response.StatusCode, e}
	}
	if root == nil {
		return &DecodeError{response.StatusCode, fmt.Errorf("expected a JSON object")}
	}
	response.Data = append(json.RawMessage(nil), root["data"]...)
	if len(response.Data) == 0 {
		response.Data = append(json.RawMessage(nil), response.Raw...)
	}
	var success *bool
	if raw, ok := root["success"]; ok {
		if e := json.Unmarshal(raw, &success); e != nil {
			return &DecodeError{response.StatusCode, e}
		}
	}
	code := int64(0)
	if raw, ok := root["code"]; ok && string(raw) != "null" {
		var n json.Number
		if e := json.Unmarshal(raw, &n); e != nil {
			return &DecodeError{response.StatusCode, e}
		}
		v, e := strconv.ParseInt(string(n), 10, 64)
		if e != nil {
			return &DecodeError{response.StatusCode, e}
		}
		code = v
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 || (success != nil && !*success) || code != 0 {
		message := "request rejected"
		for _, key := range []string{"msg", "message"} {
			var value string
			if json.Unmarshal(root[key], &value) == nil && value != "" {
				message = value
				break
			}
		}
		return &APIError{response.StatusCode, code, message}
	}
	return nil
}
func required(value, name string) error {
	if strings.TrimSpace(value) == "" {
		return fmt.Errorf("%s required", name)
	}
	return nil
}
func (c *Client) searchIDs(now int64) (string, string, error) {
	c.randMu.Lock()
	defer c.randMu.Unlock()
	var data [8]byte
	if _, e := io.ReadFull(c.random, data[:]); e != nil {
		return "", "", e
	}
	sample := float64(binary.BigEndian.Uint64(data[:])>>11) / float64(uint64(1)<<53)
	id, e := xhs.GenerateSearchID(now, sample, "")
	if e != nil {
		return "", "", e
	}
	request, e := xhs.GenerateSearchRequestID(now, sample)
	return id, request, e
}
func (c *Client) newUUID() (string, error) {
	c.randMu.Lock()
	defer c.randMu.Unlock()
	return xhs.GenerateUUID(c.random)
}
