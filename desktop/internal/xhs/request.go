package xhs

import (
	"context"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const acceptEncoding = "gzip, deflate, br, zstd"
const acceptLanguage = "zh-CN,zh;q=0.9,en;q=0.8,zh-TW;q=0.7,ja;q=0.6"

type RequestOptions struct {
	Tier                 string
	Version              *uint32
	XT                   int64
	TraceID, XrayTraceID string
	RAP                  *RAPInput
	ExtraHeaders         Headers
}

// RequestSpec makes routing explicit for PC APIs outside the default search path.
type RequestSpec struct {
	Method, Origin, Path string
	Body                 Body
	ExtraHeaders         Headers
	Unsigned             bool
	WithCookies          bool
}

func needsRAP(api string) bool {
	path := strings.Trim(strings.SplitN(api, "?", 2)[0], "/")
	for _, candidate := range []string{"api/sns/web/v1/homefeed", "api/sns/web/v1/search/notes", "api/sns/web/v2/search/notes", "api/sns/web/v1/user_posted", "api/sns/web/v1/feed", "api/sns/web/v1/comment/post"} {
		if path == candidate || (strings.Contains(candidate, "user_posted") && strings.Contains(path, candidate)) {
			return true
		}
	}
	return false
}
func needsXY(api string) bool {
	path := strings.Trim(strings.SplitN(api, "?", 2)[0], "/")
	return path == "api/sns/web/v1/feed" || path == "api/sns/web/v1/homefeed"
}

func (s *Session) Prepare(method, origin, api string, body Body, dsl string, options RequestOptions) (PreparedRequest, error) {
	parsed, e := url.ParseRequestURI(api)
	if e != nil || !strings.HasPrefix(api, "/") || parsed.Host != "" || parsed.RequestURI() != api {
		return PreparedRequest{}, fmt.Errorf("API must be an encoded relative request path")
	}
	if _, e = cookieHost(origin); e != nil {
		return PreparedRequest{}, e
	}
	originURL, originErr := url.Parse(origin)
	if originErr != nil || (originURL.Scheme != "http" && originURL.Scheme != "https") || originURL.User != nil || originURL.RawQuery != "" || originURL.Fragment != "" {
		return PreparedRequest{}, fmt.Errorf("invalid request origin")
	}
	method = strings.ToUpper(method)
	if method == "" {
		return PreparedRequest{}, fmt.Errorf("request method required")
	}
	if method == "GET" && len(body.Bytes) > 0 {
		return PreparedRequest{}, fmt.Errorf("PC GET requests must have an empty body")
	}
	if dsl == "" {
		return PreparedRequest{}, fmt.Errorf("DS anchor required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, key := range []string{"a1", "web_session"} {
		if s.cookies.shared.Get(key) == nil || jsText(s.cookies.shared.Get(key)) == "" {
			return PreparedRequest{}, fmt.Errorf("Cookie must contain %s", key)
		}
	}
	if needsXY(api) && s.state.UserID == "" {
		return PreparedRequest{}, fmt.Errorf("user_id required for xy-direction; validate account first")
	}
	body.Bytes = append([]byte(nil), body.Bytes...)
	now := s.clock().UnixMilli()
	p, tier, e := s.nextContextLocked(api, options.Tier, options.Version, now)
	if e != nil {
		return PreparedRequest{}, e
	}
	b1, e := s.b1Locked(now)
	if e != nil {
		return PreparedRequest{}, e
	}
	if now-s.state.DSLLT >= int64(15*time.Minute/time.Millisecond) {
		s.state.DSLLT = now
	}
	xt := options.XT
	if xt == 0 {
		xt = s.clock().UnixMilli()
	}
	timestamp := uint32(s.clock().UnixMilli())
	input := SignInput{API: api, Body: body, Cookie: signingCookie(s.cookies.shared), Context: p, Tier: tier, XT: xt, B1: b1, DSLPair: strconv.FormatInt(s.state.DSLLT, 10) + ";" + dsl, WebBuild: s.state.WebBuild, SignVersion: jsText(s.release.Get("signVersion")), Platform: jsText(s.release.Get("platform")), WebSSK: s.storage.Get("webSsk"), SSKTimestamp: &timestamp, Random: s.random}
	// Current Python adapter does not forward signCount; preserve x10=0.
	signature, e := SignRequest(input)
	if e != nil {
		return PreparedRequest{}, e
	}
	// Preserve the PC Python adapter's gate; the lower-level algorithm remains
	// usable with explicitly supplied layouts for reference work.
	expectedLength := map[string]int{"0101": 205, "0201": 208, "0301": 200}[tier]
	if signature.Length != expectedLength {
		return PreparedRequest{}, fmt.Errorf("PC mns%s length %d, expected %d", tier, signature.Length, expectedLength)
	}
	trace := options.TraceID
	if trace == "" {
		trace, e = traceID(s.random)
		if e != nil {
			return PreparedRequest{}, e
		}
	}
	xray := options.XrayTraceID
	if xray == "" {
		s.xraySeq = (s.xraySeq + 1) & 0x7fffff
		xray, e = xrayID(s.clock().UnixMilli(), s.xraySeq, s.random)
		if e != nil {
			return PreparedRequest{}, e
		}
	}
	headers := Object{{"referer", "https://www.xiaohongshu.com/"}, {"x-xray-traceid", xray}, {"x-t", signature.XT}, {"x-b3-traceid", trace}, {"x-s-common", signature.XSCommon}, {"user-agent", s.release.Get("userAgent")}, {"accept", "application/json, text/plain, */*"}, {"x-s", signature.XS}, {"accept-encoding", acceptEncoding}, {"accept-language", acceptLanguage}, {"origin", "https://www.xiaohongshu.com"}, {"priority", "u=1, i"}, {"sec-fetch-dest", "empty"}, {"sec-fetch-mode", "cors"}, {"sec-fetch-site", "same-site"}}
	if len(body.Bytes) > 0 {
		headers.Set("content-type", "application/json;charset=UTF-8")
	}
	if needsRAP(api) {
		rap := RAPInput{}
		if options.RAP != nil {
			rap = *options.RAP
		}
		rap.API = api
		rap.Body = body.Bytes
		if rap.TimestampMS == 0 {
			rap.TimestampMS = s.clock().UnixMilli()
		}
		if rap.Random == nil {
			rap.Random = s.random
		}
		result, e := BuildRAP(rap)
		if e != nil {
			return PreparedRequest{}, e
		}
		headers.Set("x-rap-param", result.Value)
	}
	if needsXY(api) {
		headers.Set("xy-direction", strconv.FormatUint(uint64(XYDirection(s.state.UserID)), 10))
	}
	target := strings.TrimRight(origin, "/") + api
	wire, e := s.cookies.ForURL(target)
	if e != nil {
		return PreparedRequest{}, e
	}
	headers.Set("cookie", CookieHeader(wire))
	path := strings.SplitN(api, "?", 2)[0]
	if path == "/api/sns/web/v1/config" || path == "/api/sns/web/v1/system/config" || path == "/api/sns/web/v2/user/me" {
		headers.Set("cache-control", "no-cache")
		headers.Set("pragma", "no-cache")
	}
	for _, h := range options.ExtraHeaders {
		name := strings.ToLower(h.Name)
		if name != "content-type" {
			return PreparedRequest{}, fmt.Errorf("unsupported PC header override %s", name)
		}
		headers.Set(name, h.Value)
	}
	ordered, e := businessHeaders(headers, method)
	if e != nil {
		return PreparedRequest{}, e
	}
	return PreparedRequest{method, target, ordered, body.Bytes, signature}, nil
}
func businessHeaders(values Object, method string) (Headers, error) {
	order := []string{"referer", "x-xray-traceid", "x-t", "x-b3-traceid", "x-s-common", "user-agent", "accept", "content-type", "x-s", "accept-encoding", "accept-language", "cookie", "origin", "priority", "sec-fetch-dest", "sec-fetch-mode", "sec-fetch-site"}
	if values.Has("x-rap-param") {
		order = []string{"referer", "x-xray-traceid", "x-t", "x-b3-traceid", "x-s-common", "x-rap-param", "accept", "content-type", "x-s", "user-agent", "accept-encoding", "accept-language", "cookie", "origin", "priority", "sec-fetch-dest", "sec-fetch-mode", "sec-fetch-site"}
		if method == "GET" {
			order = []string{"referer", "x-xray-traceid", "x-t", "x-b3-traceid", "x-s-common", "x-rap-param", "user-agent", "accept", "x-s", "accept-encoding", "accept-language", "cookie", "origin", "priority", "sec-fetch-dest", "sec-fetch-mode", "sec-fetch-site"}
		}
	}
	if values.Has("xy-direction") {
		order = append([]string{"xy-direction"}, order...)
	}
	out := Headers{}
	seen := map[string]bool{}
	for _, name := range order {
		if name == "cookie" && values.Has("cache-control") {
			out = append(out, Header{"cache-control", jsText(values.Get("cache-control"))})
			seen["cache-control"] = true
		}
		if name == "priority" && values.Has("pragma") {
			out = append(out, Header{"pragma", jsText(values.Get("pragma"))})
			seen["pragma"] = true
		}
		if values.Has(name) {
			out = append(out, Header{name, jsText(values.Get(name))})
			seen[name] = true
		} else if name != "content-type" {
			return nil, fmt.Errorf("required header %s missing", name)
		}
	}
	for _, f := range values {
		if !seen[f.Name] {
			return nil, fmt.Errorf("unexpected business header %s", f.Name)
		}
	}
	return out, nil
}

type Client struct {
	Session   *Session
	transport Transport
	ds        *DSCache
	apiOrigin string
}

func NewClient(session *Session, transport Transport) *Client {
	return NewClientAt(session, transport, APIOrigin)
}
func NewClientAt(session *Session, transport Transport, origin string) *Client {
	c := &Client{Session: session, transport: transport, apiOrigin: origin}
	c.ds = NewDSCache(func(ctx context.Context) (string, error) {
		ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
		defer cancel()
		session.mu.Lock()
		userAgent := jsText(session.release.Get("userAgent"))
		session.mu.Unlock()
		response, e := transport.Do(ctx, PreparedRequest{Method: "GET", URL: DSURL, Headers: Headers{{"user-agent", userAgent}, {"referer", "https://www.xiaohongshu.com/"}, {"accept", "*/*"}, {"accept-encoding", acceptEncoding}}})
		if e != nil {
			return "", e
		}
		if response.StatusCode < 200 || response.StatusCode >= 300 {
			return "", fmt.Errorf("DS HTTP status %d", response.StatusCode)
		}
		return ParseDSAnchor(response.Body)
	}, session.clock)
	return c
}
func (c *Client) Close() error { return c.transport.Close() }
func (c *Client) Do(ctx context.Context, method, api string, body Body) (Response, error) {
	origin := c.apiOrigin
	if strings.HasPrefix(api, "/api/sns/web/v2/search/") {
		origin = SearchOrigin
	}
	return c.Execute(ctx, RequestSpec{Method: method, Origin: origin, Path: api, Body: body})
}

func (c *Client) Execute(ctx context.Context, spec RequestSpec) (Response, error) {
	select {
	case c.Session.gate <- struct{}{}:
	case <-ctx.Done():
		return Response{}, ctx.Err()
	}
	defer func() { <-c.Session.gate }()
	if spec.Origin == "" {
		spec.Origin = c.apiOrigin
	}
	if spec.Unsigned {
		path, pathErr := url.ParseRequestURI(spec.Path)
		origin, originErr := url.Parse(spec.Origin)
		if pathErr != nil || !strings.HasPrefix(spec.Path, "/") || path.Host != "" || path.RequestURI() != spec.Path || originErr != nil || origin.Hostname() == "" || (origin.Scheme != "http" && origin.Scheme != "https") || origin.User != nil || origin.RawQuery != "" || origin.Fragment != "" {
			return Response{}, fmt.Errorf("invalid public navigation target")
		}
		if spec.Method != "GET" || len(spec.Body.Bytes) != 0 {
			return Response{}, fmt.Errorf("unsigned navigation supports GET only")
		}
		ua := jsText(object(resourceObject("reference_profile.json").Get("release")).Get("userAgent"))
		headers := Headers{{"upgrade-insecure-requests", "1"}, {"user-agent", ua}, {"sec-ch-ua", `"Not;A=Brand";v="8", "Chromium";v="152", "Google Chrome";v="152"`}, {"sec-ch-ua-mobile", "?0"}, {"sec-ch-ua-platform", `"Windows"`}, {"accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7"}, {"accept-encoding", acceptEncoding}, {"accept-language", "zh-CN,zh;q=0.9"}, {"priority", "u=0, i"}, {"sec-fetch-dest", "document"}, {"sec-fetch-mode", "navigate"}, {"sec-fetch-site", "none"}, {"sec-fetch-user", "?1"}}
		target := strings.TrimRight(spec.Origin, "/") + spec.Path
		if spec.WithCookies {
			cookie, err := c.Session.CookieForURL(target)
			if err != nil {
				return Response{}, err
			}
			ordered := make(Headers, 0, len(headers)+1)
			for _, h := range headers {
				if h.Name == "priority" {
					ordered = append(ordered, Header{"cookie", cookie})
				}
				ordered = append(ordered, h)
			}
			headers = ordered
		}
		response, err := c.transport.Do(ctx, PreparedRequest{Method: "GET", URL: target, Headers: headers})
		if err != nil {
			return Response{}, err
		}
		if spec.WithCookies {
			if err = c.Session.MergeCookies(target, response.Cookies); err != nil {
				return response, err
			}
		}
		return response, nil
	}
	if needsXY(spec.Path) && c.Session.Snapshot().UserID == "" {
		response, e := c.doLocked(ctx, "GET", "/api/sns/web/v2/user/me", Body{})
		if e != nil {
			return Response{}, e
		}
		if _, e = c.acceptMe(response); e != nil {
			return Response{}, e
		}
	}
	return c.executeLocked(ctx, spec)
}
func (c *Client) doLocked(ctx context.Context, method, api string, body Body) (Response, error) {
	origin := c.apiOrigin
	if strings.HasPrefix(api, "/api/sns/web/v2/search/") {
		origin = SearchOrigin
	}
	return c.executeLocked(ctx, RequestSpec{Method: method, Origin: origin, Path: api, Body: body})
}
func (c *Client) executeLocked(ctx context.Context, spec RequestSpec) (Response, error) {
	if e := ctx.Err(); e != nil {
		return Response{}, e
	}
	c.Session.mu.Lock()
	dsl := c.Session.dsl
	c.Session.mu.Unlock()
	if dsl == "" {
		var e error
		dsl, e = c.ds.Get(ctx, false)
		if e != nil {
			return Response{}, e
		}
	}
	request, e := c.Session.Prepare(spec.Method, spec.Origin, spec.Path, spec.Body, dsl, RequestOptions{ExtraHeaders: spec.ExtraHeaders})
	if e != nil {
		return Response{}, e
	}
	response, e := c.transport.Do(ctx, request)
	if e != nil {
		return Response{}, e
	}
	source := response.URL
	if source == "" {
		source = request.URL
	}
	if e = c.Session.MergeCookies(source, response.Cookies); e != nil {
		return Response{}, e
	}
	return response, nil
}

type APIError struct {
	StatusCode int
	Code       int64
	Message    string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("XHS request failed: HTTP %d, code %d, %s", e.StatusCode, e.Code, e.Message)
}
func DecodeAPIResponse(response Response) (Object, error) {
	v, e := ParseJSON(response.Body)
	if e != nil {
		return nil, fmt.Errorf("XHS HTTP %d returned invalid JSON", response.StatusCode)
	}
	o, ok := v.(Object)
	if !ok {
		return nil, fmt.Errorf("XHS response must be an object")
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 || o.Get("success") != true {
		return nil, &APIError{response.StatusCode, int64(number(o.Get("code"))), jsText(fallback(o, "msg", fallback(o, "message", "request rejected")))}
	}
	return o, nil
}
func (c *Client) GetMe(ctx context.Context) (Object, error) {
	response, e := c.Do(ctx, "GET", "/api/sns/web/v2/user/me", Body{})
	if e != nil {
		return nil, e
	}
	return c.acceptMe(response)
}
func (c *Client) acceptMe(response Response) (Object, error) {
	o, e := DecodeAPIResponse(response)
	if e != nil {
		return nil, e
	}
	data := object(o.Get("data"))
	id, ok := data.Get("user_id").(string)
	if !ok || id == "" {
		return nil, fmt.Errorf("user/me did not return user_id")
	}
	c.Session.SetUserID(id)
	return data, nil
}
