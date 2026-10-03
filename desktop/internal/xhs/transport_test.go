package xhs

import (
	"bytes"
	"compress/gzip"
	"compress/zlib"
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"sync"
	"testing"
	"time"

	"github.com/andybalholm/brotli"
	"github.com/klauspost/compress/zstd"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/hpack"
)

func TestResponseEncodings(t *testing.T) {
	input := []byte(`{"success":true,"data":{"user_id":"synthetic"}}`)
	for _, name := range []string{"gzip", "deflate", "br", "zstd"} {
		t.Run(name, func(t *testing.T) {
			var b bytes.Buffer
			var w io.WriteCloser
			switch name {
			case "gzip":
				w = gzip.NewWriter(&b)
			case "deflate":
				w = zlib.NewWriter(&b)
			case "br":
				w = brotli.NewWriter(&b)
			case "zstd":
				z, e := zstd.NewWriter(&b)
				if e != nil {
					t.Fatal(e)
				}
				w = z
			}
			if _, e := w.Write(input); e != nil {
				t.Fatal(e)
			}
			if e := w.Close(); e != nil {
				t.Fatal(e)
			}
			got, e := decodeResponse(b.Bytes(), name, 1<<20)
			if e != nil || !bytes.Equal(got, input) {
				t.Fatalf("decode %s: %v", name, e)
			}
		})
	}
	if _, e := readLimited(bytes.NewReader(input), 2); e == nil {
		t.Fatal("response limit ignored")
	}
}

func TestChromeTransportTLSHTTP2AndBody(t *testing.T) {
	type capturedRequest struct {
		body     []byte
		protocol string
	}
	received := make(chan capturedRequest, 1)
	server := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		data, _ := io.ReadAll(r.Body)
		received <- capturedRequest{data, r.Proto}
		if r.Header.Get("Cookie") != "a1=synthetic" {
			t.Error("explicit Cookie missing")
		}
		w.Header().Set("Content-Encoding", "gzip")
		w.Header().Set("Set-Cookie", "acw_tc=synthetic-edge; Path=/")
		g := gzip.NewWriter(w)
		_, _ = g.Write([]byte(`{"success":true}`))
		_ = g.Close()
	}))
	server.EnableHTTP2 = true
	server.StartTLS()
	defer server.Close()
	roots := x509.NewCertPool()
	roots.AddCert(server.Certificate())
	transport, e := NewChromeTransport(TransportOptions{RootCAs: roots})
	if e != nil {
		t.Fatal(e)
	}
	defer transport.Close()
	body := []byte(`{"z":"a b+c","a":1}`)
	response, e := transport.Do(context.Background(), PreparedRequest{Method: "POST", URL: server.URL + "/test?z=2&a=1", Headers: Headers{{"cookie", "a1=synthetic"}, {"content-type", "application/json;charset=UTF-8"}, {"accept-encoding", acceptEncoding}}, Body: body})
	if e != nil {
		t.Fatal(e)
	}
	captured := <-received
	if captured.protocol != "HTTP/2.0" || response.Protocol != "HTTP/2.0" {
		t.Fatalf("HTTP2 not negotiated: %s %s", captured.protocol, response.Protocol)
	}
	if !bytes.Equal(captured.body, body) {
		t.Fatal("wire body changed")
	}
	if string(response.Body) != `{"success":true}` {
		t.Fatalf("gzip was not decoded: %s", response.Body)
	}
	if len(response.Cookies) != 1 || response.Cookies[0].Name != "acw_tc" {
		t.Fatal("Set-Cookie missing")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, e = transport.Do(ctx, PreparedRequest{Method: "GET", URL: server.URL}); !errors.Is(e, context.Canceled) {
		t.Fatal("transport cancellation ignored")
	}
}

// Decode the actual client HPACK frames, rather than inspecting a header map.
func TestChromeTransportWireHeaderOrder(t *testing.T) {
	certServer := httptest.NewTLSServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	certificate := certServer.TLS.Certificates[0]
	roots := x509.NewCertPool()
	roots.AddCert(certServer.Certificate())
	certServer.Close()
	listener, e := tls.Listen("tcp", "127.0.0.1:0", &tls.Config{Certificates: []tls.Certificate{certificate}, NextProtos: []string{"h2"}, MinVersion: tls.VersionTLS12})
	if e != nil {
		t.Fatal(e)
	}
	defer listener.Close()
	result := make(chan []hpack.HeaderField, 1)
	serverError := make(chan error, 1)
	go func() {
		conn, e := listener.Accept()
		if e != nil {
			serverError <- e
			return
		}
		defer conn.Close()
		_ = conn.SetDeadline(time.Now().Add(5 * time.Second))
		preface := make([]byte, len(http2.ClientPreface))
		if _, e = io.ReadFull(conn, preface); e != nil {
			serverError <- e
			return
		}
		if string(preface) != http2.ClientPreface {
			serverError <- errors.New("invalid HTTP2 preface")
			return
		}
		framer := http2.NewFramer(conn, conn)
		framer.ReadMetaHeaders = hpack.NewDecoder(65536, nil)
		if e = framer.WriteSettings(); e != nil {
			serverError <- e
			return
		}
		for {
			frame, e := framer.ReadFrame()
			if e != nil {
				serverError <- e
				return
			}
			switch f := frame.(type) {
			case *http2.SettingsFrame:
				if !f.IsAck() {
					if e = framer.WriteSettingsAck(); e != nil {
						serverError <- e
						return
					}
				}
			case *http2.MetaHeadersFrame:
				result <- f.Fields
				var b bytes.Buffer
				encoder := hpack.NewEncoder(&b)
				_ = encoder.WriteField(hpack.HeaderField{Name: ":status", Value: "200"})
				_ = encoder.WriteField(hpack.HeaderField{Name: "content-length", Value: "2"})
				if e = framer.WriteHeaders(http2.HeadersFrameParam{StreamID: f.StreamID, BlockFragment: b.Bytes(), EndHeaders: true}); e != nil {
					serverError <- e
					return
				}
				if e = framer.WriteData(f.StreamID, true, []byte("ok")); e != nil {
					serverError <- e
				}
				return
			}
		}
	}()
	transport, e := NewChromeTransport(TransportOptions{RootCAs: roots})
	if e != nil {
		t.Fatal(e)
	}
	defer transport.Close()
	_, e = transport.Do(context.Background(), PreparedRequest{Method: "GET", URL: "https://" + listener.Addr().String() + "/test", Headers: Headers{{"referer", "https://example.test/"}, {"x-t", "123"}, {"user-agent", "synthetic"}, {"accept", "application/json"}, {"cookie", "a1=synthetic"}}})
	if e != nil {
		t.Fatal(e)
	}
	select {
	case fields := <-result:
		names := []string{}
		for _, f := range fields {
			names = append(names, f.Name)
		}
		want := []string{":method", ":authority", ":scheme", ":path", "referer", "x-t", "user-agent", "accept", "cookie"}
		if !reflect.DeepEqual(names, want) {
			t.Fatalf("wire headers: %v", names)
		}
	case e := <-serverError:
		t.Fatal(e)
	case <-time.After(5 * time.Second):
		t.Fatal("header capture timed out")
	}
}

type fakeTransport struct {
	mu       sync.Mutex
	requests []PreparedRequest
}

func (f *fakeTransport) Close() error { return nil }
func (f *fakeTransport) Do(ctx context.Context, r PreparedRequest) (Response, error) {
	if e := ctx.Err(); e != nil {
		return Response{}, e
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	f.requests = append(f.requests, r)
	body := []byte(`{"success":true,"data":{"user_id":"synthetic"}}`)
	if r.URL == DSURL {
		body = []byte("function getdss(){return '1790999998000';}")
	}
	return Response{StatusCode: 200, Body: body, URL: r.URL}, nil
}
func TestClientCallChain(t *testing.T) {
	s, e := NewSession(fixtureCookie(true), SessionOptions{Clock: func() time.Time { return time.UnixMilli(fixtureNow) }})
	if e != nil {
		t.Fatal(e)
	}
	transport := &fakeTransport{}
	client := NewClient(s, transport)
	body, e := JSONBody(Object{{"source_note_id", "synthetic"}})
	if e != nil {
		t.Fatal(e)
	}
	if _, e = client.Do(context.Background(), "POST", "/api/sns/web/v1/feed", body); e != nil {
		t.Fatal(e)
	}
	if len(transport.requests) != 3 || transport.requests[0].URL != DSURL || transport.requests[1].URL != APIOrigin+"/api/sns/web/v2/user/me" || transport.requests[2].Headers.Get("xy-direction") == "" {
		t.Fatal("DS → account bootstrap → signed feed chain differs")
	}
	if s.Snapshot().Sequence != 2 || s.Snapshot().UserID != "synthetic" {
		t.Fatal("session was not updated")
	}
	if _, e = client.GetMe(context.Background()); e != nil {
		t.Fatal(e)
	}
	if len(transport.requests) != 4 {
		t.Fatal("DS cache was not reused")
	}
}
