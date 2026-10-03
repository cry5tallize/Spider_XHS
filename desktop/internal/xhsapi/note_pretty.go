package xhsapi

import (
	"cmp"
	"slices"
	"strings"
)

func normalizeNoteCodec(codec, group string) string {
	value := codec
	if value == "" {
		value = group
	}
	switch strings.ToLower(value) {
	case "ef4", "h264", "h.264", "avc", "avc1":
		return "h264"
	case "ef5", "h265", "h.265", "hevc", "hev1", "hvc1":
		return "h265"
	default:
		return value
	}
}

// CandidateURLs lists all nonempty addresses, primary first, without rewriting
// URLs. Source records retain their original values in memory.
func (s VideoStream) CandidateURLs() []string {
	out := make([]string, 0, len(s.BackupURLs)+2)
	seen := make(map[string]struct{}, len(s.BackupURLs)+2)
	add := func(value string) {
		if value == "" {
			return
		}
		if _, exists := seen[value]; !exists {
			seen[value] = struct{}{}
			out = append(out, value)
		}
	}
	add(s.MasterURL)
	add(s.URL)
	for _, value := range s.BackupURLs {
		add(value)
	}
	return out
}

// Normalize URL aliases within a single stream, keeping different signed URLs
// distinct. Raw source records retain empty and duplicate wire values.
func normalizeVideoStreamURLs(s *VideoStream) {
	if s.URL == s.MasterURL {
		s.URL = ""
	}
	s.BackupURLs = uniqueVideoBackups(s.MasterURL, s.URL, s.BackupURLs, nil)
}

func uniqueVideoBackups(master, url string, primary, secondary []string) []string {
	capacity := len(primary) + len(secondary)
	if capacity == 0 {
		return []string{}
	}
	seen := make(map[string]struct{}, capacity+2)
	seen[master], seen[url], seen[""] = struct{}{}, struct{}{}, struct{}{}
	backups := make([]string, 0, capacity)
	for _, values := range [2][]string{primary, secondary} {
		for _, value := range values {
			if _, exists := seen[value]; !exists {
				seen[value] = struct{}{}
				backups = append(backups, value)
			}
		}
	}
	return backups
}

func hasVideoStreamURL(s VideoStream) bool {
	if s.MasterURL != "" || s.URL != "" {
		return true
	}
	for _, value := range s.BackupURLs {
		if value != "" {
			return true
		}
	}
	return false
}

type videoStreamSortKey struct {
	index     int
	available bool
	pixels    float64
	fps       float64
	codec     string
	bitrate   int64
}

// SortVideoStreams returns a new slice; it never removes candidates or changes
// the input. Resolution/FPS precede codec ordering. Bitrates are compared only
// within the same codec, since different codecs have different efficiencies.
func SortVideoStreams(streams []VideoStream) []VideoStream {
	keys := make([]videoStreamSortKey, len(streams))
	for i, stream := range streams {
		keys[i] = videoStreamSortKey{i, hasVideoStreamURL(stream), streamPixelCount(stream), optionalNoteNumber(stream.FPS), strings.ToLower(stream.Codec), streamBitrate(stream)}
	}
	slices.SortStableFunc(keys, func(a, b videoStreamSortKey) int {
		if a.available != b.available {
			if a.available {
				return -1
			}
			return 1
		}
		if order := cmp.Compare(b.pixels, a.pixels); order != 0 {
			return order
		}
		if order := cmp.Compare(b.fps, a.fps); order != 0 {
			return order
		}
		if order := cmp.Compare(a.codec, b.codec); order != 0 {
			return order
		}
		return cmp.Compare(b.bitrate, a.bitrate)
	})
	out := make([]VideoStream, len(streams))
	for i, key := range keys {
		out[i] = streams[key.index]
	}
	return out
}

func streamPixelCount(s VideoStream) float64 {
	if s.Width == nil || s.Height == nil || *s.Width <= 0 || *s.Height <= 0 {
		return 0
	}
	return float64(*s.Width) * float64(*s.Height)
}

func streamBitrate(s VideoStream) int64 {
	if s.VideoBitrate != nil && *s.VideoBitrate > 0 {
		return *s.VideoBitrate
	}
	if s.AverageBitrate != nil && *s.AverageBitrate > 0 {
		return *s.AverageBitrate
	}
	return 0
}

func optionalNoteNumber(value *float64) float64 {
	if value == nil || *value < 0 {
		return 0
	}
	return *value
}

type imageVariantSortKey struct {
	index     int
	available bool
	rank      int
	pixels    float64
}

// SortImageVariants only sorts. NormalizeImageVariants additionally merges URL
// aliases. WebDft precedes other DFT scenes; image order is unaffected.
func SortImageVariants(variants []ImageVariant) []ImageVariant {
	keys := make([]imageVariantSortKey, len(variants))
	for i, variant := range variants {
		keys[i] = imageVariantSortKey{i, variant.URL != "", imageVariantRank(variant), imagePixelCount(variant)}
	}
	slices.SortStableFunc(keys, func(a, b imageVariantSortKey) int {
		if a.available != b.available {
			if a.available {
				return -1
			}
			return 1
		}
		if order := cmp.Compare(a.rank, b.rank); order != 0 {
			return order
		}
		return cmp.Compare(b.pixels, a.pixels)
	})
	out := make([]ImageVariant, len(variants))
	for i, key := range keys {
		out[i] = variants[key.index]
	}
	return out
}

// NormalizeImageVariants merges exact nonempty URLs, retaining every scene and
// metadata record in Sources. WebDft is the preferred representative. The input
// is untouched; empty wire values remain available in the original image Raw.
func NormalizeImageVariants(variants []ImageVariant) []ImageVariant {
	out := make([]ImageVariant, 0, len(variants))
	byURL := make(map[string]int, len(variants))
	for _, variant := range variants {
		if variant.URL == "" {
			continue
		}
		sources := variant.Sources
		if len(sources) == 0 {
			sources = []ImageVariantSource{{Scene: variant.Scene, Source: variant.Source, Index: variant.Index,
				Format: variant.Format, Width: variant.Width, Height: variant.Height, Extra: variant.Extra, Raw: variant.Raw}}
		}
		index, exists := byURL[variant.URL]
		if !exists {
			variant.Sources = append([]ImageVariantSource(nil), sources...)
			byURL[variant.URL] = len(out)
			out = append(out, variant)
			continue
		}
		current := out[index]
		allSources := append(current.Sources, sources...)
		preferred, fallback := current, variant
		if imageVariantRank(variant) < imageVariantRank(current) || (imageVariantRank(variant) == imageVariantRank(current) && imagePixelCount(variant) > imagePixelCount(current)) {
			preferred, fallback = variant, current
		}
		if preferred.Format == "" {
			preferred.Format = fallback.Format
		}
		if preferred.Width == nil {
			preferred.Width = fallback.Width
		}
		if preferred.Height == nil {
			preferred.Height = fallback.Height
		}
		preferred.Sources = allSources
		preferred.Extra = mergeNoteExtra(preferred.Extra, fallback.Extra)
		out[index] = preferred
	}
	return SortImageVariants(out)
}

func imagePixelCount(v ImageVariant) float64 {
	if v.Width == nil || v.Height == nil || *v.Width <= 0 || *v.Height <= 0 {
		return 0
	}
	return float64(*v.Width) * float64(*v.Height)
}

func imageVariantRank(v ImageVariant) int {
	if isWebDftScene(v.Scene) {
		return 0
	}
	if strings.EqualFold(v.Scene, "DFT") || noteSceneSuffix(v.Scene, "_DFT") {
		return 1
	}
	if v.Source == "url_default" {
		return 2
	}
	if strings.EqualFold(v.Scene, "PRV") || noteSceneSuffix(v.Scene, "_PRV") || v.Source == "url_pre" {
		return 5
	}
	if v.Source == "url" {
		return 4
	}
	return 3
}

func isWebDftScene(scene string) bool {
	return strings.EqualFold(scene, "WB_DFT") || strings.EqualFold(scene, "WEB_DFT") || strings.EqualFold(scene, "WebDft") || strings.EqualFold(scene, "WBDft")
}

func noteSceneSuffix(scene, suffix string) bool {
	return len(scene) >= len(suffix) && strings.EqualFold(scene[len(scene)-len(suffix):], suffix)
}

func sameImageScene(a, b string) bool {
	return strings.EqualFold(a, b) || (isWebDftScene(a) && isWebDftScene(b))
}

// FilterVideoStreams accepts a raw group, raw codec, or normalized codec name.
// It preserves the already sorted order and never alters the input.
func FilterVideoStreams(streams []VideoStream, codec string) []VideoStream {
	out := []VideoStream{}
	for _, stream := range streams {
		if strings.EqualFold(codec, stream.CodecGroup) || strings.EqualFold(codec, stream.VideoCodec) || strings.EqualFold(codec, stream.Codec) {
			out = append(out, stream)
		}
	}
	return out
}

func (v NoteVideoInfo) StreamsForCodec(codec string) []VideoStream {
	return FilterVideoStreams(v.Streams, codec)
}

func (i NoteImageInfo) MotionStreamsForCodec(codec string) []VideoStream {
	return FilterVideoStreams(i.MotionStreams, codec)
}

func (i NoteImageInfo) VariantsForScene(scene string) []ImageVariant {
	out := []ImageVariant{}
	for _, variant := range i.Variants {
		matches := sameImageScene(scene, variant.Scene)
		for _, source := range variant.Sources {
			if matches {
				break
			}
			matches = sameImageScene(scene, source.Scene)
		}
		if matches {
			out = append(out, variant)
		}
	}
	return out
}
