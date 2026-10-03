package xhsapi

import (
	"context"
	"fmt"
	"net/url"
	"strings"

	"golang.org/x/net/html"
)

func ImageURL(input string) (string, error) {
	u, e := url.Parse(input)
	if e != nil || u.Hostname() == "" || (u.Scheme != "http" && u.Scheme != "https") {
		return "", fmt.Errorf("invalid image URL")
	}
	path := strings.SplitN(u.EscapedPath(), "!", 2)[0]
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		return "", fmt.Errorf("image path missing")
	}
	token := parts[len(parts)-1]
	if i := strings.Index(path, "notes_pre_post/"); i >= 0 {
		token = path[i:]
	} else if strings.Contains(input, "spectrum") {
		if len(parts) < 2 {
			return "", fmt.Errorf("invalid spectrum image path")
		}
		token = strings.Join(parts[len(parts)-2:], "/")
	} else if strings.Contains(input, ".jpg") {
		token = strings.Join(parts[max(0, len(parts)-3):], "/")
	}
	return "https://ci.xiaohongshu.com/" + token + "?imageView2/format/jpeg", nil
}

// GetVideoURL accepts a complete note link (preferred) or a bare note ID.
// Complete links preserve xsec_token/xsec_source for the authenticated page.
func (c *Client) GetVideoURL(ctx context.Context, noteURL string) (string, *Response, error) {
	ref, e := ParseNoteURL(noteURL)
	if e != nil {
		return "", nil, e
	}
	path := "/explore/" + ref.ID
	query := Params{{"xsec_token", ref.Token}, {"xsec_source", ref.Source}}
	r, e := c.videoPage(ctx, path, query)
	if e != nil {
		return "", r, e
	}
	doc, e := html.Parse(strings.NewReader(string(r.Raw)))
	if e != nil {
		return "", r, e
	}
	var address string
	var walk func(*html.Node)
	walk = func(node *html.Node) {
		if node.Type == html.ElementNode && node.Data == "meta" {
			name, content := "", ""
			for _, a := range node.Attr {
				if a.Key == "name" || a.Key == "property" {
					name = a.Val
				}
				if a.Key == "content" {
					content = a.Val
				}
			}
			if name == "og:video" {
				address = content
			}
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(doc)
	if address == "" {
		return "", r, fmt.Errorf("public page does not contain og:video")
	}
	return address, r, nil
}

func (c *Client) videoPage(ctx context.Context, path string, query Params) (*Response, error) {
	access := append(Params(nil), query...)
	base, err := url.Parse(c.options.WebOrigin)
	if err != nil {
		return nil, err
	}
	for hop := 0; hop <= 5; hop++ {
		r, requestErr := c.call(ctx, Web, "GET", path, query, nil, nil, true)
		if requestErr == nil {
			return r, nil
		}
		apiErr, isStatusError := requestErr.(*APIError)
		if r == nil || !isStatusError || (apiErr.StatusCode != 301 && apiErr.StatusCode != 302 && apiErr.StatusCode != 303 && apiErr.StatusCode != 307 && apiErr.StatusCode != 308) {
			return r, requestErr
		}
		location := r.Headers.Get("Location")
		if location == "" {
			return r, fmt.Errorf("video page HTTP %d has no Location", r.StatusCode)
		}
		current, parseErr := url.Parse(strings.TrimRight(c.options.WebOrigin, "/") + path)
		if parseErr != nil {
			return r, parseErr
		}
		next, parseErr := current.Parse(location)
		if parseErr != nil {
			return r, parseErr
		}
		if next.Host != base.Host || next.Scheme != base.Scheme || next.User != nil {
			return r, fmt.Errorf("video page redirected outside its configured website")
		}
		if strings.HasPrefix(next.Path, "/404/") || next.Path == "/404" {
			return r, fmt.Errorf("video page redirected to error page: code=%s message=%s", next.Query().Get("error_code"), next.Query().Get("error_msg"))
		}
		if hop == 5 {
			return r, fmt.Errorf("video page redirect limit reached")
		}
		values := next.Query()
		for _, field := range access {
			if !values.Has(field.Name) {
				values.Set(field.Name, fmt.Sprint(field.Value))
			}
		}
		path = next.EscapedPath()
		if path == "" {
			path = "/"
		}
		if encoded := values.Encode(); encoded != "" {
			path += "?" + encoded
		}
		query = nil
	}
	return nil, fmt.Errorf("video page redirect limit reached")
}
