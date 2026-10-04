// Package mediahttp provides bounded streaming downloads, independent of the API transport.
package mediahttp

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/downloads"
)

type idleConn struct{ net.Conn }

func (c idleConn) Read(p []byte) (int, error) {
	if err := c.SetReadDeadline(time.Now().Add(30 * time.Second)); err != nil {
		return 0, err
	}
	return c.Conn.Read(p)
}

type Executor struct {
	client    *http.Client
	transport *http.Transport
	buffers   sync.Pool
}

func New() *Executor {
	dialer := &net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}
	t := &http.Transport{Proxy: http.ProxyFromEnvironment, DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
		c, err := dialer.DialContext(ctx, network, address)
		if err != nil {
			return nil, err
		}
		return idleConn{c}, nil
	},
		TLSHandshakeTimeout: 10 * time.Second, ResponseHeaderTimeout: 15 * time.Second, IdleConnTimeout: 90 * time.Second, MaxIdleConns: 128, MaxIdleConnsPerHost: 4, MaxConnsPerHost: 4, DisableCompression: true, ForceAttemptHTTP2: true}
	e := &Executor{transport: t, buffers: sync.Pool{New: func() any { return make([]byte, 256*1024) }}}
	e.client = &http.Client{Transport: t, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 5 {
			return errors.New("too many redirects")
		}
		if req.URL.User != nil || (req.URL.Scheme != "https" && req.URL.Scheme != "http") {
			return errors.New("invalid redirect")
		}
		if via[0].URL.Scheme == "https" && req.URL.Scheme != "https" {
			return errors.New("insecure redirect")
		}
		return nil
	}}
	return e
}
func (e *Executor) Close() error { e.transport.CloseIdleConnections(); return nil }
func fsError() error {
	return &downloads.Failure{Kind: downloads.ErrorFileSystem, Message: "无法写入下载目录或替换文件"}
}
func openRoot(directory string, create bool) (*os.Root, error) {
	if create {
		if err := os.MkdirAll(directory, 0o755); err != nil {
			return nil, fsError()
		}
	}
	root, err := os.OpenRoot(directory)
	if err != nil {
		return nil, fsError()
	}
	return root, nil
}
func (e *Executor) Prepare(ctx context.Context, c downloads.Config, item downloads.Item, progress func(downloads.Progress), attempt func(downloads.Attempt)) (downloads.Prepared, error) {
	root, err := openRoot(c.Output.Directory, true)
	if err != nil {
		return downloads.Prepared{}, err
	}
	defer root.Close()
	if err = root.MkdirAll(filepath.Dir(item.RelativePath), 0o755); err != nil {
		return downloads.Prepared{}, fsError()
	}
	part := item.RelativePath + ".part." + item.ID
	if item.Inline != nil {
		return e.copyToPart(ctx, root, part, bytes.NewReader(item.Inline), int64(len(item.Inline)), item, progress)
	}
	var last error = &downloads.Failure{Kind: downloads.ErrorNetwork, Message: "没有可用下载地址"}
	tries := 0
	for endpoint, address := range item.URLs {
		for retry := 0; retry <= c.Execution.RetriesPerURL; retry++ {
			if ctx.Err() != nil {
				return downloads.Prepared{}, ctx.Err()
			}
			if tries >= c.Execution.MaxAttempts {
				return downloads.Prepared{}, last
			}
			tries++
			if retry > 0 {
				timer := time.NewTimer(time.Duration(1<<min(retry-1, 4)) * time.Second)
				select {
				case <-ctx.Done():
					timer.Stop()
					return downloads.Prepared{}, ctx.Err()
				case <-timer.C:
				}
			}
			started := time.Now().UnixMilli()
			prepared, status, retryable, err := e.request(ctx, root, part, address, item, progress)
			a := downloads.Attempt{ItemID: item.ID, Number: item.Attempts + tries, EndpointIndex: endpoint, Status: status, StartedAtMS: started, FinishedAtMS: time.Now().UnixMilli()}
			if err != nil {
				a.Error = "下载请求或内容校验失败"
			}
			attempt(a)
			if err == nil {
				return prepared, nil
			}
			last = err
			var failure *downloads.Failure
			if errors.As(err, &failure) && failure.Kind == downloads.ErrorFileSystem {
				return downloads.Prepared{}, err
			}
			if !retryable {
				break
			}
		}
	}
	return downloads.Prepared{}, last
}
func (e *Executor) request(ctx context.Context, root *os.Root, part, address string, item downloads.Item, progress func(downloads.Progress)) (downloads.Prepared, int, bool, error) {
	u, err := url.Parse(address)
	if err != nil || u.Host == "" || u.User != nil || (u.Scheme != "https" && u.Scheme != "http") {
		return downloads.Prepared{}, 0, false, &downloads.Failure{Kind: downloads.ErrorContent, Message: "无效的媒体地址"}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, address, nil)
	if err != nil {
		return downloads.Prepared{}, 0, false, err
	}
	req.Header.Set("Accept-Encoding", "identity")
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36")
	req.Header.Set("Referer", "https://www.xiaohongshu.com/")
	response, err := e.client.Do(req)
	if err != nil {
		return downloads.Prepared{}, 0, true, &downloads.Failure{Kind: downloads.ErrorNetwork, Message: "媒体请求失败，请检查网络", Retryable: true}
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		retryable := response.StatusCode == 429 || response.StatusCode >= 500
		return downloads.Prepared{}, response.StatusCode, retryable, &downloads.Failure{Kind: downloads.ErrorNetwork, Message: "媒体服务器拒绝请求", HTTPStatus: response.StatusCode, Retryable: retryable}
	}
	contentType := strings.ToLower(response.Header.Get("Content-Type"))
	if strings.Contains(contentType, "text/html") || strings.Contains(contentType, "json") {
		return downloads.Prepared{}, 200, false, &downloads.Failure{Kind: downloads.ErrorContent, Message: "服务器返回了网页或 JSON，未保存为媒体"}
	}
	prepared, err := e.copyToPart(ctx, root, part, response.Body, response.ContentLength, item, progress)
	var failure *downloads.Failure
	retryable := err != nil && !errors.As(err, &failure)
	return prepared, 200, retryable, err
}
func validMedia(kind downloads.MediaKind, head []byte) bool {
	if kind != downloads.MediaVideo && kind != downloads.MediaMotion && kind != downloads.MediaImage {
		return true
	}
	typeName := http.DetectContentType(head)
	if kind == downloads.MediaImage {
		return strings.HasPrefix(typeName, "image/") || (len(head) >= 12 && string(head[4:8]) == "ftyp" && (string(head[8:12]) == "avif" || string(head[8:12]) == "avis"))
	}
	return strings.HasPrefix(typeName, "video/") || (len(head) >= 8 && string(head[4:8]) == "ftyp") || (len(head) >= 4 && bytes.Equal(head[:4], []byte{0x1a, 0x45, 0xdf, 0xa3})) || (len(head) >= 3 && string(head[:3]) == "FLV")
}
func (e *Executor) copyToPart(ctx context.Context, root *os.Root, part string, reader io.Reader, length int64, item downloads.Item, progress func(downloads.Progress)) (prepared downloads.Prepared, err error) {
	// Exclusive creation never truncates a symlink or an existing formal file.
	file, err := root.OpenFile(part, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return prepared, fsError()
	}
	good := false
	defer func() {
		if file != nil {
			_ = file.Close()
		}
		if !good {
			_ = root.Remove(part)
		}
	}()
	hash := sha256.New()
	buffer := e.buffers.Get().([]byte)
	defer e.buffers.Put(buffer)
	var total *int64
	if length >= 0 {
		total = &length
	} else {
		total = item.ExpectedBytes
	}
	progress(downloads.Progress{Total: total})
	var count int64
	head := make([]byte, 0, 512)
	for {
		if ctx.Err() != nil {
			return prepared, ctx.Err()
		}
		n, readErr := reader.Read(buffer)
		if n > 0 {
			if len(head) < 512 {
				head = append(head, buffer[:min(n, 512-len(head))]...)
			}
			written, writeErr := file.Write(buffer[:n])
			if writeErr != nil || written != n {
				return prepared, fsError()
			}
			hash.Write(buffer[:n])
			count += int64(n)
			progress(downloads.Progress{CurrentBytes: count, Delta: int64(n), Total: total})
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return prepared, readErr
		}
	}
	if (length >= 0 && count != length) || (item.ExpectedBytes != nil && *item.ExpectedBytes > 0 && count != *item.ExpectedBytes) {
		return prepared, &downloads.Failure{Kind: downloads.ErrorContent, Message: "媒体长度与服务器规格不一致"}
	}
	if count == 0 || !validMedia(item.Kind, head) {
		return prepared, &downloads.Failure{Kind: downloads.ErrorContent, Message: "内容不是预期的媒体格式"}
	}
	if err = file.Sync(); err != nil {
		return prepared, fsError()
	}
	if err = file.Close(); err != nil {
		file = nil
		return prepared, fsError()
	}
	file = nil
	good = true
	return downloads.Prepared{TemporaryPath: part, Bytes: count, SHA256: hex.EncodeToString(hash.Sum(nil))}, nil
}
func (e *Executor) Commit(ctx context.Context, c downloads.Config, item downloads.Item, p downloads.Prepared) (downloads.Result, error) {
	if err := ctx.Err(); err != nil {
		return downloads.Result{}, err
	}
	root, err := openRoot(c.Output.Directory, false)
	if err != nil {
		return downloads.Result{}, err
	}
	defer root.Close()
	// Go 1.26 Root.Rename uses handle-relative NtSetInformationFile with
	// REPLACE_IF_EXISTS on Windows; no delete-before-rename gap or path escape.
	if err = root.Rename(p.TemporaryPath, item.RelativePath); err != nil {
		return downloads.Result{}, fsError()
	}
	info, err := root.Stat(item.RelativePath)
	if err != nil {
		return downloads.Result{}, fsError()
	}
	return downloads.Result{Root: c.Output.Directory, RelativePath: item.RelativePath, Bytes: p.Bytes, SHA256: p.SHA256, MtimeMS: info.ModTime().UnixMilli()}, nil
}
func (e *Executor) Discard(c downloads.Config, p downloads.Prepared) error {
	root, err := openRoot(c.Output.Directory, false)
	if err != nil {
		return err
	}
	defer root.Close()
	err = root.Remove(p.TemporaryPath)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}
func (e *Executor) Verify(ctx context.Context, result downloads.Result, strict bool) bool {
	root, err := openRoot(result.Root, false)
	if err != nil {
		return false
	}
	defer root.Close()
	file, err := root.Open(result.RelativePath)
	if err != nil {
		return false
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Size() != result.Bytes {
		return false
	}
	if !strict && info.ModTime().UnixMilli() == result.MtimeMS {
		return true
	}
	if result.SHA256 == "" {
		return false
	}
	hash := sha256.New()
	buffer := e.buffers.Get().([]byte)
	defer e.buffers.Put(buffer)
	for {
		if ctx.Err() != nil {
			return false
		}
		n, err := file.Read(buffer)
		if n > 0 {
			hash.Write(buffer[:n])
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			return false
		}
	}
	return hex.EncodeToString(hash.Sum(nil)) == result.SHA256
}
func (e *Executor) Existing(ctx context.Context, c downloads.Config, item downloads.Item) (downloads.Result, bool, error) {
	if ctx.Err() != nil {
		return downloads.Result{}, false, ctx.Err()
	}
	root, err := openRoot(c.Output.Directory, false)
	if err != nil {
		return downloads.Result{}, false, nil
	}
	defer root.Close()
	info, err := root.Stat(item.RelativePath)
	if errors.Is(err, os.ErrNotExist) {
		return downloads.Result{}, false, nil
	}
	if err != nil {
		return downloads.Result{}, false, fsError()
	}
	if !info.Mode().IsRegular() {
		return downloads.Result{}, false, fsError()
	}
	return downloads.Result{Root: c.Output.Directory, RelativePath: item.RelativePath, Bytes: info.Size(), MtimeMS: info.ModTime().UnixMilli(), SkipReason: downloads.SkipFileExists}, true, nil
}
