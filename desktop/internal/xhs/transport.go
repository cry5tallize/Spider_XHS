package xhs

import (
	"bytes"
	"compress/flate"
	"compress/gzip"
	"compress/zlib"
	"context"
	"crypto/x509"
	"fmt"
	"io"
	stdhttp "net/http"
	"strings"
	"time"

	"github.com/andybalholm/brotli"
	http "github.com/bogdanfinn/fhttp"
	tlsclient "github.com/bogdanfinn/tls-client"
	"github.com/bogdanfinn/tls-client/profiles"
	"github.com/klauspost/compress/zstd"
)

type Header struct{ Name, Value string }
type Headers []Header

func (h Headers) Get(name string) string {
	for _, v := range h {
		if strings.EqualFold(v.Name, name) {
			return v.Value
		}
	}
	return ""
}

type PreparedRequest struct {
	Method, URL string
	Headers     Headers
	Body        []byte
	Signature   Signature
}
type Response struct {
	StatusCode    int
	Headers       stdhttp.Header
	Body          []byte
	Cookies       []CookieUpdate
	URL, Protocol string
}
type Transport interface {
	Do(context.Context, PreparedRequest) (Response, error)
	Close() error
}
type TransportOptions struct {
	ProxyURL         string
	Timeout          time.Duration
	RootCAs          *x509.CertPool
	MaxResponseBytes int64
}
type ChromeTransport struct {
	client tlsclient.HttpClient
	limit  int64
}

func NewChromeTransport(options TransportOptions) (*ChromeTransport, error) {
	timeout := options.Timeout
	if timeout <= 0 {
		timeout = 15 * time.Second
	}
	limit := options.MaxResponseBytes
	if limit <= 0 {
		limit = 32 << 20
	}
	opts := []tlsclient.HttpClientOption{tlsclient.WithClientProfile(profiles.Chrome_146), tlsclient.WithRandomTLSExtensionOrder(), tlsclient.WithDisableHttp3(), tlsclient.WithNotFollowRedirects(), tlsclient.WithTimeoutMilliseconds(int(timeout.Milliseconds())), tlsclient.WithTransportOptions(&tlsclient.TransportOptions{DisableCompression: true, RootCAs: options.RootCAs})}
	if options.ProxyURL != "" {
		opts = append(opts, tlsclient.WithProxyUrl(options.ProxyURL))
	}
	client, e := tlsclient.NewHttpClient(tlsclient.NewNoopLogger(), opts...)
	if e != nil {
		return nil, e
	}
	return &ChromeTransport{client, limit}, nil
}
func (t *ChromeTransport) Close() error { t.client.CloseIdleConnections(); return nil }
func (t *ChromeTransport) Do(ctx context.Context, input PreparedRequest) (Response, error) {
	if e := ctx.Err(); e != nil {
		return Response{}, e
	}
	var body io.Reader
	if len(input.Body) > 0 {
		body = bytes.NewReader(input.Body)
	}
	req, e := http.NewRequestWithContext(ctx, input.Method, input.URL, body)
	if e != nil {
		return Response{}, e
	}
	req.Header = make(http.Header)
	order := []string{}
	for _, h := range input.Headers {
		name := strings.ToLower(h.Name)
		req.Header[name] = append(req.Header[name], h.Value)
		order = append(order, name)
	}
	req.Header[http.HeaderOrderKey] = order
	resp, e := t.client.Do(req)
	if e != nil {
		return Response{}, e
	}
	defer resp.Body.Close()
	data, e := readLimited(resp.Body, t.limit)
	if e != nil {
		return Response{}, e
	}
	if !resp.Uncompressed {
		data, e = decodeResponse(data, resp.Header.Get("Content-Encoding"), t.limit)
		if e != nil {
			return Response{}, e
		}
	}
	headers := stdhttp.Header(resp.Header).Clone()
	cookieResponse := stdhttp.Response{Header: headers}
	updates := []CookieUpdate{}
	for _, c := range cookieResponse.Cookies() {
		updates = append(updates, CookieUpdate{c.Name, c.Value, c.MaxAge < 0 || (!c.Expires.IsZero() && c.Expires.Before(time.Now()))})
	}
	return Response{resp.StatusCode, headers, data, updates, req.URL.String(), resp.Proto}, nil
}
func readLimited(r io.Reader, limit int64) ([]byte, error) {
	data, e := io.ReadAll(io.LimitReader(r, limit+1))
	if e != nil {
		return nil, e
	}
	if int64(len(data)) > limit {
		return nil, fmt.Errorf("response exceeds configured size limit")
	}
	return data, nil
}
func decodeResponse(data []byte, encoding string, limit int64) ([]byte, error) {
	encodings := strings.Split(strings.ToLower(encoding), ",")
	for i := len(encodings) - 1; i >= 0; i-- {
		name := strings.TrimSpace(encodings[i])
		var r io.Reader
		var closeFn func() error
		switch name {
		case "", "identity":
			continue
		case "gzip":
			g, e := gzip.NewReader(bytes.NewReader(data))
			if e != nil {
				return nil, e
			}
			r = g
			closeFn = g.Close
		case "deflate":
			z, e := zlib.NewReader(bytes.NewReader(data))
			if e != nil {
				z = flate.NewReader(bytes.NewReader(data))
			}
			r = z
			closeFn = z.Close
		case "br":
			r = brotli.NewReader(bytes.NewReader(data))
		case "zstd":
			z, e := zstd.NewReader(bytes.NewReader(data))
			if e != nil {
				return nil, e
			}
			r = z
			closeFn = func() error { z.Close(); return nil }
		default:
			return nil, fmt.Errorf("unsupported response encoding %q", name)
		}
		out, e := readLimited(r, limit)
		if closeFn != nil {
			closeFn()
		}
		if e != nil {
			return nil, e
		}
		data = out
	}
	return data, nil
}
