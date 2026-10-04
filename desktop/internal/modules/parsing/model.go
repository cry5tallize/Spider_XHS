// Package parsing owns durable batch/user collection jobs. Full note decoding
// remains in notes/xhsapi; this module coordinates sources and result items.
package parsing

import (
	"context"
	"errors"

	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/accounts"
	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/notes"
	"github.com/cry5tallize/xhs_spider_desktop/internal/xhsapi"
)

type Mode int8

const (
	ModeUnknown Mode = 0
	ModeNotes   Mode = 1
	ModeUsers   Mode = 2
)

type State int8

const (
	StateUnknown State = 0
	Queued       State = 1
	Running      State = 2
	Succeeded    State = 3
	Partial      State = 4
	Failed       State = 5
	Paused       State = 6
	Canceled     State = 7
	Interrupted  State = 8
	Limited      State = 9
)

type ItemState int8

const (
	ItemUnknown     ItemState = 0
	Pending         ItemState = 1
	Resolving       ItemState = 2
	Complete        ItemState = 3
	ItemFailed      ItemState = 4
	Skipped         ItemState = 5
	Incomplete      ItemState = 6
	ItemInterrupted ItemState = 7
	ItemCanceled    ItemState = 8
)

type SourceState int8

const (
	SourceUnknown  SourceState = 0
	SourcePending  SourceState = 1
	SourceRunning  SourceState = 2
	SourceComplete SourceState = 3
	SourceFailed   SourceState = 4
	SourceLimited  SourceState = 5
)

type AccountMode int8

const (
	AccountUnknown  AccountMode = 0
	AccountFixed    AccountMode = 1
	AccountBySource AccountMode = 2
)

type CacheMode int8

const (
	CacheUnknown CacheMode = 0
	UseFresh     CacheMode = 1
	ForceRefresh CacheMode = 2
	CacheOnly    CacheMode = 3
)

type LiveFilter int8

const (
	LiveAny     LiveFilter = 0
	LiveOnly    LiveFilter = 1
	LiveExclude LiveFilter = 2
)

var (
	ErrNotFound = errors.New("批量解析记录不存在")
	ErrConflict = errors.New("批量解析状态已变更")
)

type Config struct {
	MaxPages         int         `json:"max_pages"`
	MaxNotes         int         `json:"max_notes"`
	Concurrency      int         `json:"concurrency"`
	AccountMode      AccountMode `json:"account_mode"`
	AccountIDs       []string    `json:"account_ids"`
	CacheMode        CacheMode   `json:"cache_mode"`
	CacheTTLMS       int64       `json:"cache_ttl_ms"`
	Kind             notes.Kind  `json:"kind"`
	PublishedFromMS  int64       `json:"published_from_ms"`
	PublishedUntilMS int64       `json:"published_until_ms"`
	TitleKeyword     string      `json:"title_keyword"`
	LivePhoto        LiveFilter  `json:"live_photo"`
	SaveRaw          bool        `json:"save_raw"`
}

func Defaults() Config {
	return Config{MaxPages: 100, Concurrency: 2, AccountMode: AccountFixed, CacheMode: UseFresh, CacheTTLMS: 600000, SaveRaw: true, AccountIDs: []string{}}
}

type Start struct {
	RequestID string `json:"request_id"`
	Mode      Mode   `json:"mode"`
	AccountID string `json:"account_id"`
	Text      string `json:"text"`
	Config    Config `json:"config"`
}
type Job struct {
	ID           string         `json:"id"`
	Mode         Mode           `json:"mode"`
	State        State          `json:"state"`
	Config       Config         `json:"config"`
	SourceCount  int            `json:"source_count"`
	Discovered   int            `json:"discovered"`
	Completed    int            `json:"completed"`
	FailedItems  int            `json:"failed_items"`
	SkippedItems int            `json:"skipped_items"`
	ActiveItems  int            `json:"active_items"`
	Failure      *notes.Failure `json:"failure"`
	LimitReason  string         `json:"limit_reason"`
	CreatedAtMS  int64          `json:"created_at_ms"`
	UpdatedAtMS  int64          `json:"updated_at_ms"`
	Revision     int64          `json:"revision"`
	RunVersion   int64          `json:"run_version"`
}
type Source struct {
	ID                string                  `json:"id"`
	JobID             string                  `json:"job_id"`
	Index             int                     `json:"index"`
	TargetID          string                  `json:"target_id"`
	AccountID         string                  `json:"account_id"`
	CredentialVersion int64                   `json:"credential_version"`
	State             SourceState             `json:"state"`
	Cursor            string                  `json:"-"`
	Pages             int                     `json:"pages"`
	HasMore           bool                    `json:"has_more"`
	UserName          string                  `json:"user_name"`
	Failure           *notes.Failure          `json:"failure"`
	LimitReason       string                  `json:"limit_reason"`
	InputBlob         []byte                  `json:"-"`
	Provider          accounts.SecretProvider `json:"-"`
}
type Item struct {
	ID                string                  `json:"id"`
	JobID             string                  `json:"job_id"`
	NoteID            string                  `json:"note_id"`
	Title             string                  `json:"title"`
	RawKind           string                  `json:"raw_kind"`
	AccountID         string                  `json:"account_id"`
	CredentialVersion int64                   `json:"credential_version"`
	State             ItemState               `json:"state"`
	SnapshotID        string                  `json:"snapshot_id"`
	Failure           *notes.Failure          `json:"failure"`
	SkipReason        string                  `json:"skip_reason"`
	OriginCount       int                     `json:"origin_count"`
	Ordinal           int64                   `json:"ordinal"`
	PublishedAtMS     *int64                  `json:"published_at_ms"`
	RefBlob           []byte                  `json:"-"`
	Provider          accounts.SecretProvider `json:"-"`
}
type ItemQuery struct {
	JobID        string    `json:"job_id"`
	Limit        int       `json:"limit"`
	AfterOrdinal int64     `json:"after_ordinal"`
	State        ItemState `json:"state"`
}
type ItemPage struct {
	Items       []Item `json:"items"`
	HasMore     bool   `json:"has_more"`
	NextOrdinal int64  `json:"next_ordinal"`
}
type Origin struct {
	Index     int    `json:"index"`
	TargetID  string `json:"target_id"`
	AccountID string `json:"account_id"`
	Pages     int    `json:"pages"`
}
type User struct {
	ID                string
	Nickname          string
	AvatarURL         string
	Raw               []byte
	CredentialVersion int64
}
type UserNote struct {
	Ref           xhsapi.NoteRef
	Title         string
	RawKind       string
	PublishedAtMS *int64
}
type UserPage struct {
	Notes             []UserNote
	Cursor            string
	HasMore           bool
	CredentialVersion int64
}
type DiscoveredItem struct {
	Item     Item
	SourceID string
	RefBlob  []byte
	Priority int
}
type SourceInput struct {
	URL string `json:"url"`
}
type Secrets interface {
	Provider() accounts.SecretProvider
	Protect([]byte, string) ([]byte, error)
	Unprotect([]byte, string) ([]byte, error)
}
type AccountSource interface {
	List(context.Context) ([]accounts.Account, error)
	SessionAccount(context.Context, string) (accounts.Account, error)
}
type Fetcher interface {
	ExpandURL(context.Context, string) (string, error)
	FetchUser(context.Context, string, string) (User, error)
	FetchUserPage(context.Context, string, xhsapi.UserRef, string) (UserPage, error)
	FetchNote(context.Context, string, xhsapi.NoteRef) (notes.Payload, error)
}
