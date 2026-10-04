package paths

import (
	"errors"
	"os"
	"path/filepath"
)

type Profile int8

const (
	ProfileUnknown Profile = 0
	Development    Profile = 1
	Production     Profile = 2
)

type Paths struct {
	DataDirectory     string
	DatabasePath      string
	DownloadDirectory string
	WebviewDirectory  string
}

// Resolve is side-effect-free; resources are only created after single-instance selection.
func Resolve(profile Profile, override string) (Paths, error) {
	if profile != Development && profile != Production {
		return Paths{}, errors.New("invalid application profile")
	}
	directory := override
	if directory == "" {
		executable, err := os.Executable()
		if err != nil {
			return Paths{}, err
		}
		directory = filepath.Join(filepath.Dir(executable), "data")
	}
	absolute, err := filepath.Abs(directory)
	if err != nil {
		return Paths{}, err
	}
	return Paths{DataDirectory: absolute, DatabasePath: filepath.Join(absolute, "desktop.sqlite"),
		DownloadDirectory: filepath.Join(absolute, "downloads"), WebviewDirectory: filepath.Join(absolute, "webview")}, nil
}
