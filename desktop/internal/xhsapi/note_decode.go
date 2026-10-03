package xhsapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strconv"
)

// DecodeNotes reads a feed's data.items without performing any requests. On
// malformed optional fields, usable notes are returned alongside path errors.
func (r *Response) DecodeNotes() ([]Note, error) {
	if r == nil {
		return nil, fmt.Errorf("response is nil")
	}
	var errs []error
	d := newNoteFields(r.Data, "data", &errs)
	raw := d.raw("items")
	if absentJSON(raw) {
		d.fail("items", fmt.Errorf("expected note item array"))
		return nil, errors.Join(errs...)
	}
	notes, err := parseNoteItems(raw, "data.items")
	return notes, errors.Join(append(errs, err)...)
}

// ParseNoteItems reads an array of feed item wrappers, such as note_response.json.
// The returned slices include all candidates and are sorted by available quality
// metadata. Raw bytes are retained in memory; unknown fields are exported as Extra.
func ParseNoteItems(raw json.RawMessage) ([]Note, error) {
	return parseNoteItems(raw, "items")
}

func parseNoteItems(raw json.RawMessage, path string) ([]Note, error) {
	var items []json.RawMessage
	if absentJSON(raw) {
		return nil, fmt.Errorf("%s: expected note item array", path)
	}
	if err := json.Unmarshal(raw, &items); err != nil {
		return nil, fmt.Errorf("%s: expected note item array: %w", path, err)
	}
	var errs []error
	notes := make([]Note, 0, len(items))
	for i, item := range items {
		notes = append(notes, decodeNoteItem(item, fmt.Sprintf("%s[%d]", path, i), &errs))
	}
	return notes, errors.Join(errs...)
}

func decodeNoteItem(raw json.RawMessage, path string, errs *[]error) Note {
	d := newNoteFields(raw, path, errs)
	cardRaw := d.raw("note_card")
	if absentJSON(cardRaw) {
		d.fail("note_card", fmt.Errorf("expected note card object"))
	}
	c := newNoteFields(cardRaw, path+".note_card", errs)
	n := Note{
		ID: c.text("note_id"), ItemID: d.text("id"), ModelType: d.text("model_type"),
		Type: c.text("type"), Title: c.text("title"), Description: c.text("desc"),
		CreatedAtMS: c.integer("time"), UpdatedAtMS: c.integer("last_update_time"),
		IPLocation: c.text("ip_location"), ShareInfo: c.raw("share_info"),
		User:         decodeNoteUser(c.raw("user"), c.path+".user", errs),
		Interactions: decodeNoteInteractions(c.raw("interact_info"), c.path+".interact_info", errs),
		Images:       []NoteImageInfo{}, Tags: []NoteTag{}, MentionedUsers: []NoteUser{}, Raw: copyNoteRaw(raw),
	}
	if n.ID == "" {
		n.ID = n.ItemID
	}
	for i, image := range c.array("image_list") {
		img := decodeNoteImage(image, i, fmt.Sprintf("%s.image_list[%d]", c.path, i), errs)
		n.Images = append(n.Images, img)
		if (img.LivePhoto != nil && *img.LivePhoto) || len(img.MotionStreams) > 0 {
			n.HasLivePhoto = true
		}
	}
	for i, tag := range c.array("tag_list") {
		t := newNoteFields(tag, fmt.Sprintf("%s.tag_list[%d]", c.path, i), errs)
		if absentJSON(tag) {
			t.fail("", fmt.Errorf("expected tag object"))
		}
		out := NoteTag{ID: t.text("id"), Name: t.text("name"), Type: t.text("type"), Raw: copyNoteRaw(tag)}
		out.Extra = t.extra()
		n.Tags = append(n.Tags, out)
	}
	for i, user := range c.array("at_user_list") {
		n.MentionedUsers = append(n.MentionedUsers, decodeNoteUser(user, fmt.Sprintf("%s.at_user_list[%d]", c.path, i), errs))
	}
	if video := c.raw("video"); !absentJSON(video) {
		n.Video = decodeNoteVideo(video, c.path+".video", errs)
	}
	n.Extra, n.ItemExtra = c.extra(), d.extra()
	return n
}

func decodeNoteUser(raw json.RawMessage, path string, errs *[]error) NoteUser {
	d := newNoteFields(raw, path, errs)
	u := NoteUser{ID: d.text("user_id"), Nickname: d.text("nickname"), AvatarURL: d.text("avatar"), Token: d.text("xsec_token"), Raw: copyNoteRaw(raw)}
	if u.ID == "" {
		u.ID = d.text("id")
	}
	u.Extra = d.extra()
	return u
}

func decodeNoteInteractions(raw json.RawMessage, path string, errs *[]error) NoteInteractions {
	d := newNoteFields(raw, path, errs)
	i := NoteInteractions{
		Likes: d.integer("liked_count"), Collections: d.integer("collected_count"),
		Comments: d.integer("comment_count"), Shares: d.integer("share_count"), NiceCount: d.integer("nice_count"),
		Liked: d.boolean("liked"), Collected: d.boolean("collected"), Followed: d.boolean("followed"),
		Relation: d.text("relation"), Raw: copyNoteRaw(raw),
	}
	i.Extra = d.extra()
	return i
}

func decodeNoteImage(raw json.RawMessage, index int, path string, errs *[]error) NoteImageInfo {
	d := newNoteFields(raw, path, errs)
	if absentJSON(raw) {
		d.fail("", fmt.Errorf("expected image object"))
	}
	i := NoteImageInfo{
		Index: index, FileID: d.text("file_id"), TraceID: d.text("trace_id"),
		Width: d.integer("width"), Height: d.integer("height"), LivePhoto: d.boolean("live_photo"),
		Variants: []ImageVariant{}, Raw: copyNoteRaw(raw),
	}
	for j, entry := range d.array("info_list") {
		v := newNoteFields(entry, fmt.Sprintf("%s.info_list[%d]", path, j), errs)
		if absentJSON(entry) {
			v.fail("", fmt.Errorf("expected image variant object"))
		}
		variant := ImageVariant{
			Scene: v.text("image_scene"), Source: "info_list", Index: j, URL: v.text("url"),
			Format: v.text("format"), Width: v.integer("width"), Height: v.integer("height"), Raw: copyNoteRaw(entry),
		}
		variant.Extra = v.extra()
		i.Variants = append(i.Variants, variant)
	}
	for _, name := range []string{"url_default", "url_pre", "url"} {
		value := d.raw(name)
		if absentJSON(value) {
			continue
		}
		url, err := noteScalarText(value)
		if err != nil {
			d.fail(name, err)
		}
		// Keep even empty values, and aliases with the same URL but a different source.
		i.Variants = append(i.Variants, ImageVariant{Source: name, Index: len(i.Variants), URL: url, Raw: value})
	}
	i.MotionStreams, i.StreamGroups = decodeStreamGroups(d.raw("stream"), "image.stream", path+".stream", errs)
	i.Variants = NormalizeImageVariants(i.Variants)
	i.MotionStreams = SortVideoStreams(i.MotionStreams)
	i.Extra = d.extra()
	return i
}

func decodeNoteVideo(raw json.RawMessage, path string, errs *[]error) *NoteVideoInfo {
	d := newNoteFields(raw, path, errs)
	v := &NoteVideoInfo{Streams: []VideoStream{}, Sources: []VideoMediaSource{}, Raw: copyNoteRaw(raw)}
	for _, name := range []string{"media_v2", "media"} {
		value := d.raw(name)
		if absentJSON(value) {
			continue
		}
		source, streams := decodeVideoMedia(value, name, path+"."+name, errs)
		v.Sources = append(v.Sources, source)
		if v.VideoID == "" {
			v.VideoID = source.VideoID
		}
		fillNoteStruct(&v.Metadata, source.Metadata)
		v.Metadata.Extra = mergeNoteExtra(v.Metadata.Extra, source.Metadata.Extra)
		v.Metadata.StreamTypes = unionNoteValues(v.Metadata.StreamTypes, source.Metadata.StreamTypes)
		if name == "media_v2" {
			v.Streams = append(v.Streams, streams...)
		} else {
			v.Streams = mergeVideoStreams(v.Streams, streams)
		}
	}
	imageRaw := d.raw("image")
	image := newNoteFields(imageRaw, path+".image", errs)
	v.Image = VideoImageInfo{FirstFrameFileID: image.text("first_frame_fileid"), ThumbnailFileID: image.text("thumbnail_fileid"), Raw: imageRaw}
	v.Image.Extra = image.extra()
	capaRaw := d.raw("capa")
	capa := newNoteFields(capaRaw, path+".capa", errs)
	v.CapaDurationSec = capa.number("duration")
	v.Extra = d.extra()
	if extra := capa.extra(); len(extra) > 0 {
		if v.Extra == nil {
			v.Extra = map[string]json.RawMessage{}
		}
		// Preserve the original namespace, rather than mixing capa fields into video.
		v.Extra["capa"] = capaRaw
	}
	v.Streams = SortVideoStreams(v.Streams)
	return v
}

func decodeVideoMedia(raw json.RawMessage, name, path string, errs *[]error) (VideoMediaSource, []VideoStream) {
	value := bytes.TrimSpace(raw)
	if len(value) > 0 && value[0] == '"' {
		var encoded string
		if err := json.Unmarshal(value, &encoded); err != nil {
			*errs = append(*errs, fmt.Errorf("%s: %w", path, err))
		} else {
			value = []byte(encoded)
		}
	}
	d := newNoteFields(value, path, errs)
	s := VideoMediaSource{Name: name, VideoID: d.text("video_id"), Raw: copyNoteRaw(raw)}
	s.Metadata = decodeVideoMetadata(d.raw("video"), path+".video", errs)
	streams, groups := decodeStreamGroups(d.raw("stream"), name, path+".stream", errs)
	s.StreamGroups, s.Extra = groups, d.extra()
	return s, streams
}

func decodeVideoMetadata(raw json.RawMessage, path string, errs *[]error) VideoMetadata {
	d := newNoteFields(raw, path, errs)
	v := VideoMetadata{
		BizID: d.text("biz_id"), BizName: d.integer("biz_name"), DurationSec: d.number("duration"),
		Width: d.integer("width"), Height: d.integer("height"), MD5: d.text("md5"),
		HDRType: d.integer("hdr_type"), DRMType: d.integer("drm_type"), Raw: copyNoteRaw(raw),
	}
	for i, rawType := range d.array("stream_types") {
		s, err := noteScalarText(rawType)
		var n int64
		if err == nil {
			n, err = strconv.ParseInt(s, 10, 64)
		}
		if err != nil {
			d.fail(fmt.Sprintf("stream_types[%d]", i), err)
			continue
		}
		v.StreamTypes = append(v.StreamTypes, n)
	}
	v.Extra = d.extra()
	return v
}

// Decode object members in wire order. Groups are open strings; array lengths
// are unrestricted. Empty groups remain listed in the source metadata.
func decodeStreamGroups(raw json.RawMessage, source, path string, errs *[]error) ([]VideoStream, []string) {
	streams, groups := []VideoStream{}, []string{}
	if absentJSON(raw) {
		return streams, groups
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	opening, err := decoder.Token()
	if err != nil || opening != json.Delim('{') {
		if err == nil {
			err = fmt.Errorf("expected stream group object")
		}
		*errs = append(*errs, fmt.Errorf("%s: %w", path, err))
		return streams, groups
	}
	for decoder.More() {
		token, err := decoder.Token()
		if err != nil {
			*errs = append(*errs, fmt.Errorf("%s: %w", path, err))
			break
		}
		group := token.(string)
		groupIndex := len(groups)
		groups = append(groups, group)
		var entriesRaw json.RawMessage
		if err := decoder.Decode(&entriesRaw); err != nil {
			*errs = append(*errs, fmt.Errorf("%s[%q]: %w", path, group, err))
			break
		}
		if absentJSON(entriesRaw) {
			continue
		}
		var entries []json.RawMessage
		if err := json.Unmarshal(entriesRaw, &entries); err != nil {
			*errs = append(*errs, fmt.Errorf("%s[%q]: expected stream array: %w", path, group, err))
			continue
		}
		for i, entry := range entries {
			entryPath := fmt.Sprintf("%s[%q][%d]", path, group, i)
			streams = append(streams, decodeVideoStream(entry, source, group, groupIndex, i, entryPath, errs))
		}
	}
	if _, err := decoder.Token(); err != nil {
		*errs = append(*errs, fmt.Errorf("%s: %w", path, err))
	}
	return streams, groups
}

func decodeVideoStream(raw json.RawMessage, source, group string, groupIndex, index int, path string, errs *[]error) VideoStream {
	d := newNoteFields(raw, path, errs)
	if absentJSON(raw) {
		d.fail("", fmt.Errorf("expected stream object"))
	}
	s := VideoStream{CodecGroup: group, Sources: []VideoStreamSource{{Name: source, CodecGroup: group, GroupIndex: groupIndex, Index: index, Raw: copyNoteRaw(raw)}}}
	s.StreamMetadata = StreamMetadata{
		StreamType: d.integer("stream_type"), StreamDesc: d.text("stream_desc"), DefaultStream: d.integer("default_stream"),
		Format: d.text("format"), QualityType: d.text("quality_type"), Width: d.integer("width"), Height: d.integer("height"),
		FPS: d.number("fps"), SizeBytes: d.integer("size"), DurationMS: d.number("duration"),
		VideoDurationMS: d.number("video_duration"), AudioDurationMS: d.number("audio_duration"),
		AverageBitrate: d.integer("avg_bitrate"), VideoBitrate: d.integer("video_bitrate"), AudioBitrate: d.integer("audio_bitrate"),
		VideoCodec: d.text("video_codec"), AudioCodec: d.text("audio_codec"), AudioChannels: d.integer("audio_channels"),
		Rotate: d.integer("rotate"), Volume: d.number("volume"), HDRType: d.integer("hdr_type"),
		Weight: d.number("weight"), VMAF: d.number("vmaf"), PSNR: d.number("psnr"), SSIM: d.number("ssim"), SR: d.integer("sr"),
	}
	s.MasterURL, s.URL, s.BackupURLs = d.text("master_url"), d.text("url"), d.strings("backup_urls")
	normalizeVideoStreamURLs(&s)
	s.Codec, s.Extra = normalizeNoteCodec(s.VideoCodec, group), d.extra()
	return s
}

// Only match across the two sources, one record to one record. Equal records
// within either source are kept, as are different URLs and conflicting metadata.
func mergeVideoStreams(primary, secondary []VideoStream) []VideoStream {
	if len(primary) == 0 {
		return append([]VideoStream{}, secondary...)
	}
	if len(secondary) == 0 {
		return append([]VideoStream{}, primary...)
	}
	// Most feed sources mirror the same streams. Reserve the primary size, and
	// grow only for actual new records rather than reserving both full lists.
	out := make([]VideoStream, len(primary))
	copy(out, primary)
	// Linked buckets avoid scanning unrelated URLs and retire matched records
	// in O(1), retaining the original one-to-one order for duplicate keys.
	type streamKey struct{ group, url string }
	type streamBucket struct{ head, tail int }
	buckets := make(map[streamKey]streamBucket, len(primary))
	next := make([]int, len(primary))
	for i, stream := range primary {
		next[i] = -1
		if stream.MasterURL == "" {
			continue
		}
		key := streamKey{stream.CodecGroup, stream.MasterURL}
		bucket, exists := buckets[key]
		if exists {
			next[bucket.tail] = i
			bucket.tail = i
		} else {
			bucket = streamBucket{i, i}
		}
		buckets[key] = bucket
	}
	for _, stream := range secondary {
		match := -1
		key := streamKey{stream.CodecGroup, stream.MasterURL}
		if bucket, exists := buckets[key]; exists {
			previous := -1
			for i := bucket.head; i >= 0; i = next[i] {
				if sameVideoStream(primary[i], stream) {
					match = i
					if previous < 0 {
						bucket.head = next[i]
					} else {
						next[previous] = next[i]
					}
					if bucket.tail == i {
						bucket.tail = previous
					}
					if bucket.head < 0 {
						delete(buckets, key)
					} else {
						buckets[key] = bucket
					}
					break
				}
				previous = i
			}
		}
		if match < 0 {
			out = append(out, stream)
			continue
		}
		current := &out[match]
		fillStreamMetadata(&current.StreamMetadata, stream.StreamMetadata)
		if current.URL == "" {
			current.URL = stream.URL
		}
		if current.URL == current.MasterURL {
			current.URL = ""
		}
		current.BackupURLs = uniqueVideoBackups(current.MasterURL, current.URL, current.BackupURLs, stream.BackupURLs)
		current.Extra = mergeNoteExtra(current.Extra, stream.Extra)
		sources := make([]VideoStreamSource, len(current.Sources)+len(stream.Sources))
		copy(sources, current.Sources)
		copy(sources[len(current.Sources):], stream.Sources)
		current.Sources = sources
	}
	return out
}

func sameVideoStream(a, b VideoStream) bool {
	if a.MasterURL == "" || a.MasterURL != b.MasterURL || a.CodecGroup != b.CodecGroup {
		return false
	}
	if a.URL != "" && b.URL != "" && a.URL != b.URL {
		return false
	}
	return compatibleStreamMetadata(a.StreamMetadata, b.StreamMetadata)
}

func compatibleOptional[T comparable](a, b *T) bool {
	return a == nil || b == nil || *a == *b
}

func compatibleStreamText(a, b string) bool { return a == "" || b == "" || a == b }

func compatibleStreamMetadata(a, b StreamMetadata) bool {
	return compatibleStreamText(a.StreamDesc, b.StreamDesc) && compatibleStreamText(a.Format, b.Format) &&
		compatibleStreamText(a.QualityType, b.QualityType) && compatibleStreamText(a.VideoCodec, b.VideoCodec) && compatibleStreamText(a.AudioCodec, b.AudioCodec) &&
		compatibleOptional(a.StreamType, b.StreamType) && compatibleOptional(a.DefaultStream, b.DefaultStream) &&
		compatibleOptional(a.Width, b.Width) && compatibleOptional(a.Height, b.Height) && compatibleOptional(a.FPS, b.FPS) &&
		compatibleOptional(a.SizeBytes, b.SizeBytes) && compatibleOptional(a.DurationMS, b.DurationMS) &&
		compatibleOptional(a.VideoDurationMS, b.VideoDurationMS) && compatibleOptional(a.AudioDurationMS, b.AudioDurationMS) &&
		compatibleOptional(a.AverageBitrate, b.AverageBitrate) && compatibleOptional(a.VideoBitrate, b.VideoBitrate) && compatibleOptional(a.AudioBitrate, b.AudioBitrate) &&
		compatibleOptional(a.AudioChannels, b.AudioChannels) && compatibleOptional(a.Rotate, b.Rotate) && compatibleOptional(a.Volume, b.Volume) &&
		compatibleOptional(a.HDRType, b.HDRType) && compatibleOptional(a.Weight, b.Weight) && compatibleOptional(a.VMAF, b.VMAF) &&
		compatibleOptional(a.PSNR, b.PSNR) && compatibleOptional(a.SSIM, b.SSIM) && compatibleOptional(a.SR, b.SR)
}

func fillOptional[T any](destination **T, fallback *T) {
	if *destination == nil {
		*destination = fallback
	}
}

func fillStreamMetadata(destination *StreamMetadata, fallback StreamMetadata) {
	if destination.StreamDesc == "" {
		destination.StreamDesc = fallback.StreamDesc
	}
	if destination.Format == "" {
		destination.Format = fallback.Format
	}
	if destination.QualityType == "" {
		destination.QualityType = fallback.QualityType
	}
	if destination.VideoCodec == "" {
		destination.VideoCodec = fallback.VideoCodec
	}
	if destination.AudioCodec == "" {
		destination.AudioCodec = fallback.AudioCodec
	}
	fillOptional(&destination.StreamType, fallback.StreamType)
	fillOptional(&destination.DefaultStream, fallback.DefaultStream)
	fillOptional(&destination.Width, fallback.Width)
	fillOptional(&destination.Height, fallback.Height)
	fillOptional(&destination.FPS, fallback.FPS)
	fillOptional(&destination.SizeBytes, fallback.SizeBytes)
	fillOptional(&destination.DurationMS, fallback.DurationMS)
	fillOptional(&destination.VideoDurationMS, fallback.VideoDurationMS)
	fillOptional(&destination.AudioDurationMS, fallback.AudioDurationMS)
	fillOptional(&destination.AverageBitrate, fallback.AverageBitrate)
	fillOptional(&destination.VideoBitrate, fallback.VideoBitrate)
	fillOptional(&destination.AudioBitrate, fallback.AudioBitrate)
	fillOptional(&destination.AudioChannels, fallback.AudioChannels)
	fillOptional(&destination.Rotate, fallback.Rotate)
	fillOptional(&destination.Volume, fallback.Volume)
	fillOptional(&destination.HDRType, fallback.HDRType)
	fillOptional(&destination.Weight, fallback.Weight)
	fillOptional(&destination.VMAF, fallback.VMAF)
	fillOptional(&destination.PSNR, fallback.PSNR)
	fillOptional(&destination.SSIM, fallback.SSIM)
	fillOptional(&destination.SR, fallback.SR)
}

// Fields are copied only when absent. Explicit zero pointers are not overwritten.
func fillNoteStruct(destination, fallback any) {
	x, y := reflect.ValueOf(destination).Elem(), reflect.ValueOf(fallback)
	for i := 0; i < x.NumField(); i++ {
		if x.Field(i).IsZero() && !y.Field(i).IsZero() {
			x.Field(i).Set(y.Field(i))
		}
	}
}

func mergeNoteExtra(primary, secondary map[string]json.RawMessage) map[string]json.RawMessage {
	if len(primary)+len(secondary) == 0 {
		return nil
	}
	out := map[string]json.RawMessage{}
	for key, raw := range secondary {
		out[key] = copyNoteRaw(raw)
	}
	for key, raw := range primary {
		out[key] = copyNoteRaw(raw)
	}
	return out
}

func unionNoteValues[T comparable](primary, secondary []T) []T {
	out := append([]T{}, primary...)
	seen := make(map[T]bool, len(primary)+len(secondary))
	for _, value := range primary {
		seen[value] = true
	}
	for _, value := range secondary {
		if !seen[value] {
			out = append(out, value)
			seen[value] = true
		}
	}
	return out
}
