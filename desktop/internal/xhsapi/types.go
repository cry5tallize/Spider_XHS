// Package xhsapi provides the Cookie-authenticated XHS PC API.
package xhsapi

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type Endpoint string

const (
	API    Endpoint = "api"
	Search Endpoint = "search"
	Web    Endpoint = "web"
)

// Params retains field order for signed query strings and JSON bodies.
type Param struct {
	Name  string
	Value any
}
type Params []Param

type Header struct{ Name, Value string }
type HTTPRequest struct {
	Method, URL string
	Headers     []Header
	Body        []byte
}
type HTTPResponse struct {
	StatusCode    int
	Headers       http.Header
	Body          []byte
	URL, Protocol string
}
type Transport interface {
	Do(context.Context, HTTPRequest) (HTTPResponse, error)
	Close() error
}
type Options struct {
	ProxyURL                           string
	Timeout                            time.Duration
	APIOrigin, SearchOrigin, WebOrigin string
	DSL                                string
	Clock                              func() time.Time
	Random                             io.Reader
	Transport                          Transport
	// OnResponse receives the unmodified body, including business/error replies.
	OnResponse func(*Response) error
}
type Response struct {
	Raw          json.RawMessage
	Data         json.RawMessage
	StatusCode   int
	Headers      http.Header
	Method, Path string
	Endpoint     Endpoint
	Duration     time.Duration
}

// NoteDetail retains the feed response separately from derived playback URLs.
type NoteDetail struct {
	Response *Response
	Videos   []VideoPlayback
}
type VideoPlayback struct {
	NoteID string    `json:"note_id"`
	URL    string    `json:"url"`
	Source string    `json:"source"`
	Error  string    `json:"error,omitempty"`
	Page   *Response `json:"-"`
}

func (r *Response) DecodeData(value any) error {
	if r == nil {
		return fmt.Errorf("response is nil")
	}
	return json.Unmarshal(r.Data, value)
}

type APIError struct {
	StatusCode int
	Code       int64
	Message    string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("XHS HTTP %d code %d: %s", e.StatusCode, e.Code, e.Message)
}

type DecodeError struct {
	StatusCode int
	Cause      error
}

func (e *DecodeError) Error() string {
	return fmt.Sprintf("XHS HTTP %d returned invalid JSON: %v", e.StatusCode, e.Cause)
}
func (e *DecodeError) Unwrap() error { return e.Cause }

type NoteRef struct{ ID, Token, Source string }
type UserRef struct{ ID, Token, Source string }
type UserNotesOptions struct {
	Cursor        string
	Num           int
	Token, Source string
}
type RecommendOptions struct {
	Category, CursorScore                string
	RefreshType, NoteIndex, Num, NeedNum int
}
type Sort string

const (
	SortGeneral     Sort = "general"
	SortLatest      Sort = "time_descending"
	SortLikes       Sort = "popularity_descending"
	SortComments    Sort = "comment_descending"
	SortCollections Sort = "collect_descending"
)

type NoteType int

const (
	NoteAll NoteType = iota
	NoteVideo
	NoteImage
)

type SearchNotesOptions struct {
	Page, PageSize                int
	SearchID, SessionID           string
	Sort                          Sort
	NoteType                      NoteType
	NoteTime, NoteRange, Distance int
	Geo                           string
}
type SearchUsersOptions struct {
	Page, PageSize      int
	SearchID, RequestID string
}
type OneboxOptions struct{ SearchID, BizType, RequestID string }
type TrendingOptions struct {
	Source, SearchType, LastQuery                        string
	LastQueryTime                                        int64
	Situation, HintWord, HintWordType, HintWordRequestID string
}
type WidgetsOptions struct {
	Source   string
	Mode     int
	ExpFlags Params
}
type CollectOptions struct{ Limit, MaxPages int }
type Collection struct {
	Items     []json.RawMessage
	Responses []*Response
}
type Page struct {
	Items    []json.RawMessage
	Cursor   string
	HasMore  bool
	Response *Response
}
type Comment struct {
	Raw     json.RawMessage
	Replies []json.RawMessage
}
type CommentCollection struct {
	Comments  []Comment
	Responses []*Response
}
