package xhsapi

import "encoding/json"

// Note is a normalized feed item. Type retains the server's open-ended value;
// a normal note may contain both ordinary images and LivePhotos.
type Note struct {
	ID             string                     `json:"id"`
	ItemID         string                     `json:"item_id,omitempty"`
	Type           string                     `json:"type"`
	ModelType      string                     `json:"model_type,omitempty"`
	Title          string                     `json:"title"`
	Description    string                     `json:"description"`
	User           NoteUser                   `json:"user"`
	Interactions   NoteInteractions           `json:"interactions"`
	Tags           []NoteTag                  `json:"tags"`
	MentionedUsers []NoteUser                 `json:"mentioned_users"`
	CreatedAtMS    *int64                     `json:"created_at_ms,omitempty"`
	UpdatedAtMS    *int64                     `json:"updated_at_ms,omitempty"`
	IPLocation     string                     `json:"ip_location,omitempty"`
	ShareInfo      json.RawMessage            `json:"share_info,omitempty"`
	Images         []NoteImageInfo            `json:"images"`
	Video          *NoteVideoInfo             `json:"video,omitempty"`
	HasLivePhoto   bool                       `json:"has_live_photo"`
	Extra          map[string]json.RawMessage `json:"extra,omitempty"`
	ItemExtra      map[string]json.RawMessage `json:"item_extra,omitempty"`
	Raw            json.RawMessage            `json:"-"`
}

type NoteUser struct {
	ID        string                     `json:"id"`
	Nickname  string                     `json:"nickname"`
	AvatarURL string                     `json:"avatar_url,omitempty"`
	Token     string                     `json:"xsec_token,omitempty"`
	Extra     map[string]json.RawMessage `json:"extra,omitempty"`
	Raw       json.RawMessage            `json:"-"`
}

type NoteTag struct {
	ID    string                     `json:"id"`
	Name  string                     `json:"name"`
	Type  string                     `json:"type"`
	Extra map[string]json.RawMessage `json:"extra,omitempty"`
	Raw   json.RawMessage            `json:"-"`
}

type NoteInteractions struct {
	Likes       *int64                     `json:"likes,omitempty"`
	Collections *int64                     `json:"collections,omitempty"`
	Comments    *int64                     `json:"comments,omitempty"`
	Shares      *int64                     `json:"shares,omitempty"`
	NiceCount   *int64                     `json:"nice_count,omitempty"`
	Liked       *bool                      `json:"liked,omitempty"`
	Collected   *bool                      `json:"collected,omitempty"`
	Followed    *bool                      `json:"followed,omitempty"`
	Relation    string                     `json:"relation,omitempty"`
	Extra       map[string]json.RawMessage `json:"extra,omitempty"`
	Raw         json.RawMessage            `json:"-"`
}

type NoteVideoInfo struct {
	VideoID         string                     `json:"video_id,omitempty"`
	Metadata        VideoMetadata              `json:"metadata"`
	CapaDurationSec *float64                   `json:"capa_duration_sec,omitempty"`
	Image           VideoImageInfo             `json:"image"`
	Streams         []VideoStream              `json:"streams"`
	Sources         []VideoMediaSource         `json:"sources"`
	Extra           map[string]json.RawMessage `json:"extra,omitempty"`
	Raw             json.RawMessage            `json:"-"`
}

// VideoMetadata is distinct from StreamMetadata: its duration is in seconds.
type VideoMetadata struct {
	BizID       string                     `json:"biz_id,omitempty"`
	BizName     *int64                     `json:"biz_name,omitempty"`
	DurationSec *float64                   `json:"duration_sec,omitempty"`
	Width       *int64                     `json:"width,omitempty"`
	Height      *int64                     `json:"height,omitempty"`
	MD5         string                     `json:"md5,omitempty"`
	HDRType     *int64                     `json:"hdr_type,omitempty"`
	DRMType     *int64                     `json:"drm_type,omitempty"`
	StreamTypes []int64                    `json:"stream_types,omitempty"`
	Extra       map[string]json.RawMessage `json:"extra,omitempty"`
	Raw         json.RawMessage            `json:"-"`
}

type VideoImageInfo struct {
	FirstFrameFileID string                     `json:"first_frame_file_id,omitempty"`
	ThumbnailFileID  string                     `json:"thumbnail_file_id,omitempty"`
	Extra            map[string]json.RawMessage `json:"extra,omitempty"`
	Raw              json.RawMessage            `json:"-"`
}

// VideoMediaSource keeps metadata and all original groups, including empty ones.
type VideoMediaSource struct {
	Name         string                     `json:"name"`
	VideoID      string                     `json:"video_id,omitempty"`
	Metadata     VideoMetadata              `json:"metadata"`
	StreamGroups []string                   `json:"stream_groups"`
	Extra        map[string]json.RawMessage `json:"extra,omitempty"`
	Raw          json.RawMessage            `json:"-"`
}

// StreamMetadata only contains fields actually present in a stream. A nil
// pointer means unavailable; zero values from the server remain non-nil.
type StreamMetadata struct {
	StreamType      *int64   `json:"stream_type,omitempty"`
	StreamDesc      string   `json:"stream_desc,omitempty"`
	DefaultStream   *int64   `json:"default_stream,omitempty"`
	Format          string   `json:"format,omitempty"`
	QualityType     string   `json:"quality_type,omitempty"`
	Width           *int64   `json:"width,omitempty"`
	Height          *int64   `json:"height,omitempty"`
	FPS             *float64 `json:"fps,omitempty"`
	SizeBytes       *int64   `json:"size_bytes,omitempty"`
	DurationMS      *float64 `json:"duration_ms,omitempty"`
	VideoDurationMS *float64 `json:"video_duration_ms,omitempty"`
	AudioDurationMS *float64 `json:"audio_duration_ms,omitempty"`
	AverageBitrate  *int64   `json:"average_bitrate,omitempty"`
	VideoBitrate    *int64   `json:"video_bitrate,omitempty"`
	AudioBitrate    *int64   `json:"audio_bitrate,omitempty"`
	VideoCodec      string   `json:"video_codec,omitempty"`
	AudioCodec      string   `json:"audio_codec,omitempty"`
	AudioChannels   *int64   `json:"audio_channels,omitempty"`
	Rotate          *int64   `json:"rotate,omitempty"`
	Volume          *float64 `json:"volume,omitempty"`
	HDRType         *int64   `json:"hdr_type,omitempty"`
	Weight          *float64 `json:"weight,omitempty"`
	VMAF            *float64 `json:"vmaf,omitempty"`
	PSNR            *float64 `json:"psnr,omitempty"`
	SSIM            *float64 `json:"ssim,omitempty"`
	SR              *int64   `json:"sr,omitempty"`
}

type VideoStream struct {
	StreamMetadata
	CodecGroup string                     `json:"codec_group"`
	Codec      string                     `json:"codec"`
	MasterURL  string                     `json:"master_url,omitempty"`
	URL        string                     `json:"url,omitempty"`
	BackupURLs []string                   `json:"backup_urls"`
	Sources    []VideoStreamSource        `json:"sources"`
	Extra      map[string]json.RawMessage `json:"extra,omitempty"`
}

// Raw includes original values in memory. It is omitted from Pretty JSON to
// avoid repeating links; the complete input is saved separately by the cmd.
type VideoStreamSource struct {
	Name       string          `json:"name"`
	CodecGroup string          `json:"codec_group"`
	GroupIndex int             `json:"group_index"`
	Index      int             `json:"index"`
	Raw        json.RawMessage `json:"-"`
}

type NoteImageInfo struct {
	Index         int                        `json:"index"`
	FileID        string                     `json:"file_id,omitempty"`
	TraceID       string                     `json:"trace_id,omitempty"`
	Width         *int64                     `json:"width,omitempty"`
	Height        *int64                     `json:"height,omitempty"`
	LivePhoto     *bool                      `json:"live_photo,omitempty"`
	Variants      []ImageVariant             `json:"variants"`
	MotionStreams []VideoStream              `json:"motion_streams"`
	StreamGroups  []string                   `json:"stream_groups"`
	Extra         map[string]json.RawMessage `json:"extra,omitempty"`
	Raw           json.RawMessage            `json:"-"`
}

type ImageVariant struct {
	Scene   string                     `json:"scene,omitempty"`
	Source  string                     `json:"source"`
	Index   int                        `json:"index"`
	URL     string                     `json:"url"`
	Format  string                     `json:"format,omitempty"`
	Width   *int64                     `json:"width,omitempty"`
	Height  *int64                     `json:"height,omitempty"`
	Sources []ImageVariantSource       `json:"sources"`
	Extra   map[string]json.RawMessage `json:"extra,omitempty"`
	Raw     json.RawMessage            `json:"-"`
}

// All entries share their parent variant's URL. Sources keep alternate scenes
// and metadata without repeating that URL in the normalized output.
type ImageVariantSource struct {
	Scene  string                     `json:"scene,omitempty"`
	Source string                     `json:"source"`
	Index  int                        `json:"index"`
	Format string                     `json:"format,omitempty"`
	Width  *int64                     `json:"width,omitempty"`
	Height *int64                     `json:"height,omitempty"`
	Extra  map[string]json.RawMessage `json:"extra,omitempty"`
	Raw    json.RawMessage            `json:"-"`
}
