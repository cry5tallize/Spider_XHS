// Package notes owns parsing jobs and immutable note snapshots. It reuses the
// canonical Pretty media model; it never selects a download representation.
package notes

import (
	"encoding/json"
	"errors"
	"github.com/cry5tallize/xhs_spider_desktop/internal/xhsapi"
)

type Kind int8

const (
	KindUnknown Kind = 0
	KindImage   Kind = 1
	KindVideo   Kind = 2
)

type ParseState int8

const (
	ParseUnknown     ParseState = 0
	ParseQueued      ParseState = 1
	ParseRunning     ParseState = 2
	ParseCompleted   ParseState = 3
	ParseFailed      ParseState = 4
	ParseCanceled    ParseState = 5
	ParseInterrupted ParseState = 6
)

type ErrorKind int8

const (
	ErrorUnknown      ErrorKind = 0
	ErrorAccount      ErrorKind = 1
	ErrorUnauthorized ErrorKind = 2
	ErrorRestricted   ErrorKind = 3
	ErrorRateLimited  ErrorKind = 4
	ErrorNetwork      ErrorKind = 5
	ErrorResponse     ErrorKind = 6
	ErrorStorage      ErrorKind = 7
	ErrorCanceled     ErrorKind = 8
)

var (
	ErrNotFound  = errors.New("笔记、快照或解析作业不存在")
	ErrConflict  = errors.New("解析状态已变更")
	ErrQueueFull = errors.New("解析队列已满，请稍后重试")
	ErrClosing   = errors.New("解析服务正在关闭")
)

type Failure struct {
	Kind         ErrorKind `json:"kind"`
	Message      string    `json:"message"`
	HTTPStatus   int       `json:"http_status"`
	UpstreamCode int64     `json:"upstream_code"`
	Retryable    bool      `json:"retryable"`
}

func (f *Failure) Error() string { return f.Message }

type StartParse struct {
	RequestID string `json:"request_id"`
	AccountID string `json:"account_id"`
	Input     string `json:"input"`
}
type ParseJob struct {
	ID           string     `json:"id"`
	RequestID    string     `json:"request_id"`
	AccountID    string     `json:"account_id"`
	NoteID       string     `json:"note_id"`
	SnapshotID   string     `json:"snapshot_id"`
	State        ParseState `json:"state"`
	Failure      *Failure   `json:"failure"`
	CreatedAtMS  int64      `json:"created_at_ms"`
	StartedAtMS  *int64     `json:"started_at_ms"`
	FinishedAtMS *int64     `json:"finished_at_ms"`
	UpdatedAtMS  int64      `json:"updated_at_ms"`
	Revision     int64      `json:"revision"`
}
type Summary struct {
	ID                string `json:"id"`
	AuthorID          string `json:"author_id"`
	AuthorName        string `json:"author_name"`
	Kind              Kind   `json:"kind"`
	RawKind           string `json:"raw_kind"`
	Title             string `json:"title"`
	Description       string `json:"description"`
	HasLivePhoto      bool   `json:"has_live_photo"`
	ImageCount        int    `json:"image_count"`
	VideoStreamCount  int    `json:"video_stream_count"`
	MotionStreamCount int    `json:"motion_stream_count"`
	CoverURL          string `json:"cover_url"`
	PublishedAtMS     *int64 `json:"published_at_ms"`
	ModifiedAtMS      *int64 `json:"modified_at_ms"`
	FetchedAtMS       int64  `json:"fetched_at_ms"`
	SnapshotID        string `json:"snapshot_id"`
}
type Snapshot struct {
	ID                string   `json:"id"`
	NoteID            string   `json:"note_id"`
	AccountID         string   `json:"account_id"`
	CredentialVersion int64    `json:"credential_version"`
	ParserVersion     int      `json:"parser_version"`
	Warnings          []string `json:"warnings"`
	FetchedAtMS       int64    `json:"fetched_at_ms"`
	RawSHA256         string   `json:"raw_sha256"`
}
type Detail struct {
	Snapshot Snapshot    `json:"snapshot"`
	Note     xhsapi.Note `json:"note"`
}

// Payload is private to adapters/storage. Raw is excluded from normal DTOs.
type Payload struct {
	Note              xhsapi.Note
	Raw               json.RawMessage
	Warnings          []string
	AccountID         string
	CredentialVersion int64
}
type ListInput struct {
	Limit      int    `json:"limit"`
	BeforeAtMS int64  `json:"before_at_ms"`
	BeforeID   string `json:"before_id"`
}
type Page struct {
	Items    []Summary `json:"items"`
	HasMore  bool      `json:"has_more"`
	NextAtMS int64     `json:"next_at_ms"`
	NextID   string    `json:"next_id"`
}

func Project(detail Detail) Summary {
	n := detail.Note
	s := Summary{ID: n.ID, AuthorID: n.User.ID, AuthorName: n.User.Nickname, RawKind: n.Type, Title: n.Title, Description: n.Description,
		HasLivePhoto: n.HasLivePhoto, ImageCount: len(n.Images), PublishedAtMS: n.CreatedAtMS, ModifiedAtMS: n.UpdatedAtMS,
		FetchedAtMS: detail.Snapshot.FetchedAtMS, SnapshotID: detail.Snapshot.ID}
	switch n.Type {
	case "normal":
		s.Kind = KindImage
	case "video":
		s.Kind = KindVideo
	}
	if n.Video != nil {
		s.VideoStreamCount = len(n.Video.Streams)
	}
	for _, image := range n.Images {
		s.MotionStreamCount += len(image.MotionStreams)
		if s.CoverURL == "" && len(image.Variants) > 0 {
			s.CoverURL = image.Variants[0].URL
		}
	}
	return s
}
