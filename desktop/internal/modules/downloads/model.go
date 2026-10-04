// Package downloads owns note tasks, ordered items and download policy.
package downloads

import (
	"context"
	"errors"
)

type State int8

const (
	Unknown      State = 0
	Queued       State = 1
	Resolving    State = 2
	Running      State = 3
	Paused       State = 4
	WaitingRetry State = 5
	Succeeded    State = 6
	Partial      State = 7
	Failed       State = 8
	Canceled     State = 9
	Interrupted  State = 10
)

type ItemState int8

const (
	ItemUnknown      ItemState = 0
	ItemPending      ItemState = 1
	ItemRunning      ItemState = 2
	ItemPaused       ItemState = 3
	ItemWaitingRetry ItemState = 4
	ItemSucceeded    ItemState = 5
	ItemSkipped      ItemState = 6
	ItemFailed       ItemState = 7
	ItemCanceled     ItemState = 8
	ItemFinalizing   ItemState = 9
	ItemInterrupted  ItemState = 10
)

type MediaKind int8

const (
	MediaUnknown  MediaKind = 0
	MediaVideo    MediaKind = 1
	MediaImage    MediaKind = 2
	MediaMotion   MediaKind = 3
	MediaPretty   MediaKind = 4
	MediaText     MediaKind = 5
	MediaRaw      MediaKind = 6
	MediaManifest MediaKind = 7
)

type ExistingPolicy int8

const (
	ExistingUnknown ExistingPolicy = 0
	Overwrite       ExistingPolicy = 1
	SkipExisting    ExistingPolicy = 2
)

type DedupMode int8

const (
	DedupOff   DedupMode = 0
	SameOutput DedupMode = 1
)

type IdentityConfidence int8

const (
	IdentityUnknown IdentityConfidence = 0
	IdentityWeak    IdentityConfidence = 1
	IdentityStrong  IdentityConfidence = 2
)

type SkipReason int8

const (
	SkipNone       SkipReason = 0
	SkipHistory    SkipReason = 1
	SkipFileExists SkipReason = 2
)

type ErrorKind int8

const (
	ErrorUnknown    ErrorKind = 0
	ErrorNetwork    ErrorKind = 1
	ErrorContent    ErrorKind = 2
	ErrorFileSystem ErrorKind = 3
	ErrorStorage    ErrorKind = 4
)

var (
	ErrNotFound = errors.New("下载任务或文件不存在")
	ErrConflict = errors.New("下载任务状态已变更")
	ErrBusy     = errors.New("下载目标正在使用")
	ErrClosing  = errors.New("下载服务正在关闭")
)

type Failure struct {
	Kind       ErrorKind `json:"kind"`
	Message    string    `json:"message"`
	HTTPStatus int       `json:"http_status"`
	Retryable  bool      `json:"retryable"`
}

func (f *Failure) Error() string { return f.Message }

type MediaConfig struct {
	Video           bool `json:"video"`
	Images          bool `json:"images"`
	VideoCover      bool `json:"video_cover"`
	LivePhotoMotion bool `json:"live_photo_motion"`
	Pretty          bool `json:"pretty"`
	Text            bool `json:"text"`
	Raw             bool `json:"raw"`
	Manifest        bool `json:"manifest"`
}
type OutputConfig struct {
	Directory      string         `json:"directory"`
	ExistingPolicy ExistingPolicy `json:"existing_policy"`
}
type DedupConfig struct {
	Mode       DedupMode `json:"mode"`
	Force      bool      `json:"force"`
	StrictHash bool      `json:"strict_hash"`
}
type ExecutionConfig struct {
	ContinueOnError bool `json:"continue_on_error"`
	RetriesPerURL   int  `json:"retries_per_url"`
	MaxAttempts     int  `json:"max_attempts"`
}
type Config struct {
	SchemaVersion int             `json:"schema_version"`
	Media         MediaConfig     `json:"media"`
	Output        OutputConfig    `json:"output"`
	Dedup         DedupConfig     `json:"dedup"`
	Execution     ExecutionConfig `json:"execution"`
}

func Defaults(directory string) Config {
	return Config{SchemaVersion: 1, Media: MediaConfig{Video: true, Images: true, LivePhotoMotion: true, Pretty: true, Manifest: true},
		Output: OutputConfig{directory, Overwrite}, Dedup: DedupConfig{Mode: SameOutput}, Execution: ExecutionConfig{ContinueOnError: true, RetriesPerURL: 2, MaxAttempts: 12}}
}

type Representation struct {
	CodecGroup string   `json:"codec_group,omitempty"`
	Codec      string   `json:"codec,omitempty"`
	Format     string   `json:"format,omitempty"`
	Scene      string   `json:"scene,omitempty"`
	Width      *int64   `json:"width,omitempty"`
	Height     *int64   `json:"height,omitempty"`
	FPS        *float64 `json:"fps,omitempty"`
	ImageIndex *int     `json:"image_index,omitempty"`
}
type PlannedItem struct {
	Sequence       int                `json:"sequence"`
	Kind           MediaKind          `json:"kind"`
	AssetKey       string             `json:"asset_key"`
	Confidence     IdentityConfidence `json:"confidence"`
	Representation Representation     `json:"representation"`
	RelativePath   string             `json:"relative_path"`
	URLs           []string           `json:"urls"`
	ExpectedBytes  *int64             `json:"expected_bytes"`
	Inline         []byte             `json:"-"`
}
type Plan struct {
	NoteID            string        `json:"note_id"`
	SnapshotID        string        `json:"snapshot_id"`
	Title             string        `json:"title"`
	AuthorID          string        `json:"author_id"`
	AuthorName        string        `json:"author_name"`
	AccountID         string        `json:"account_id"`
	Config            Config        `json:"config"`
	RelativeDirectory string        `json:"relative_directory"`
	Items             []PlannedItem `json:"items"`
	Warnings          []string      `json:"warnings"`
	Hash              string        `json:"hash"`
}
type PlanInput struct {
	SnapshotID string `json:"snapshot_id"`
	Config     Config `json:"config"`
}
type CreateTask struct {
	RequestID  string `json:"request_id"`
	SnapshotID string `json:"snapshot_id"`
	Config     Config `json:"config"`
}
type Task struct {
	ID                string   `json:"id"`
	NoteID            string   `json:"note_id"`
	SnapshotID        string   `json:"snapshot_id"`
	Title             string   `json:"title"`
	AuthorID          string   `json:"author_id"`
	AuthorName        string   `json:"author_name"`
	AccountID         string   `json:"account_id"`
	State             State    `json:"state"`
	Config            Config   `json:"config"`
	RelativeDirectory string   `json:"relative_directory"`
	PlanHash          string   `json:"plan_hash"`
	PlannedItems      int      `json:"planned_items"`
	SuccessfulItems   int      `json:"successful_items"`
	SkippedItems      int      `json:"skipped_items"`
	FailedItems       int      `json:"failed_items"`
	FulfilledItems    int      `json:"fulfilled_items"`
	CompletedBytes    int64    `json:"completed_bytes"`
	TransferredBytes  int64    `json:"transferred_bytes"`
	CurrentItemID     string   `json:"current_item_id"`
	CurrentSequence   int      `json:"current_sequence"`
	CurrentBytes      int64    `json:"current_bytes"`
	CurrentTotal      *int64   `json:"current_total"`
	Failure           *Failure `json:"failure"`
	CreatedAtMS       int64    `json:"created_at_ms"`
	StartedAtMS       *int64   `json:"started_at_ms"`
	FinishedAtMS      *int64   `json:"finished_at_ms"`
	UpdatedAtMS       int64    `json:"updated_at_ms"`
	Revision          int64    `json:"revision"`
}
type Item struct {
	ID     string `json:"id"`
	TaskID string `json:"task_id"`
	PlannedItem
	State            ItemState `json:"state"`
	TransferredBytes int64     `json:"transferred_bytes"`
	CurrentBytes     int64     `json:"current_bytes"`
	CurrentTotal     *int64    `json:"current_total"`
	Result           Result    `json:"result"`
	Failure          *Failure  `json:"failure"`
	Attempts         int       `json:"attempts"`
}
type Result struct {
	Root         string     `json:"root"`
	RelativePath string     `json:"relative_path"`
	Bytes        int64      `json:"bytes"`
	SHA256       string     `json:"sha256"`
	MtimeMS      int64      `json:"mtime_ms"`
	SkipReason   SkipReason `json:"skip_reason"`
	ReusedItemID string     `json:"reused_item_id"`
}
type Prepared struct {
	TemporaryPath string
	Bytes         int64
	SHA256        string
}
type FinalizeEntry struct {
	Item     Item
	Task     Task
	Prepared Prepared
}
type CoveredFile struct {
	ID     string
	Result Result
}
type Progress struct {
	CurrentBytes int64
	Delta        int64
	Total        *int64
}
type Attempt struct {
	ItemID        string
	Number        int
	EndpointIndex int
	Status        int
	StartedAtMS   int64
	FinishedAtMS  int64
	Error         string
}
type ListInput struct {
	Limit      int    `json:"limit"`
	BeforeAtMS int64  `json:"before_at_ms"`
	BeforeID   string `json:"before_id"`
	State      State  `json:"state"`
	NoteID     string `json:"note_id"`
	AuthorID   string `json:"author_id"`
}
type Page struct {
	Items    []Task `json:"items"`
	HasMore  bool   `json:"has_more"`
	NextAtMS int64  `json:"next_at_ms"`
	NextID   string `json:"next_id"`
}

// Executor owns HTTP and filesystem handles; the service owns DB transitions.
type Executor interface {
	Prepare(context.Context, Config, Item, func(Progress), func(Attempt)) (Prepared, error)
	Commit(context.Context, Config, Item, Prepared) (Result, error)
	Discard(Config, Prepared) error
	Verify(context.Context, Result, bool) bool
	Existing(context.Context, Config, Item) (Result, bool, error)
	Close() error
}
