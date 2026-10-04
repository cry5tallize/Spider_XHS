package paths

import (
	"os"
	"path/filepath"
	"testing"
)

func TestExecutableDataLayoutIgnoresWorkingDirectoryAndProfile(t *testing.T) {
	t.Chdir(t.TempDir())
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(filepath.Dir(executable), "data")
	for _, profile := range []Profile{Development, Production} {
		p, err := Resolve(profile, "")
		if err != nil {
			t.Fatal(err)
		}
		if p.DataDirectory != want || p.DatabasePath != filepath.Join(want, "desktop.sqlite") || p.DownloadDirectory != filepath.Join(want, "downloads") || p.WebviewDirectory != filepath.Join(want, "webview") {
			t.Fatalf("unexpected portable layout: %+v", p)
		}
	}
}
