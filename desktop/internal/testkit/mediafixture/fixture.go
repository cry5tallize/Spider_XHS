package mediafixture

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"

	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/notes"
	"github.com/cry5tallize/xhs_spider_desktop/internal/xhsapi"
)

// Fixture owns a loopback-only media server for the offline CLI and checks.
// Payload URLs are all replaced locally; no Cookie or XHS request is involved.
type Fixture struct {
	Server     *httptest.Server
	VideoBytes int64
}

func NewFixture() *Fixture {
	var pngBody bytes.Buffer
	picture := image.NewRGBA(image.Rect(0, 0, 2, 2))
	picture.Set(0, 0, color.RGBA{R: 80, G: 107, B: 255, A: 255})
	_ = png.Encode(&pngBody, picture)
	video := make([]byte, 2*1024*1024)
	copy(video, []byte{0, 0, 0, 24, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm', 0, 0, 0, 0, 'i', 's', 'o', 'm', 'm', 'p', '4', '2'})
	f := &Fixture{VideoBytes: int64(len(video))}
	f.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/image/") {
			w.Header().Set("Content-Type", "image/png")
			w.Write(pngBody.Bytes())
			return
		}
		if strings.HasPrefix(r.URL.Path, "/video/") {
			w.Header().Set("Content-Type", "video/mp4")
			w.Header().Set("Content-Length", strconv.Itoa(len(video)))
			w.Write(video)
			return
		}
		w.Header().Set("Content-Type", "text/html")
		w.WriteHeader(403)
		w.Write([]byte("denied"))
	}))
	return f
}
func (f *Fixture) Close() { f.Server.Close() }
func (f *Fixture) Localize(p notes.Payload) notes.Payload {
	streams := func(values []xhsapi.VideoStream, label string) {
		for i := range values {
			v := &values[i]
			address := f.Server.URL + "/video/" + label + "/" + strconv.Itoa(i)
			v.URL = address
			v.MasterURL = address
			v.BackupURLs = []string{}
			v.SizeBytes = &f.VideoBytes
			v.Format = "mp4"
		}
	}
	if p.Note.Video != nil {
		streams(p.Note.Video.Streams, p.Note.ID)
	}
	for i := range p.Note.Images {
		img := &p.Note.Images[i]
		for j := range img.Variants {
			img.Variants[j].URL = f.Server.URL + "/image/" + p.Note.ID + "/" + strconv.Itoa(i) + "/" + strconv.Itoa(j)
			img.Variants[j].Format = "png"
		}
		streams(img.MotionStreams, p.Note.ID+"/motion/"+strconv.Itoa(i))
	}
	return p
}
