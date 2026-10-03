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
	DataDirectory string
	DatabasePath  string
}

// Resolve is side-effect-free; resources are only created after single-instance selection.
func Resolve(profile Profile, override string) (Paths, error) {
	if profile != Development && profile != Production {
		return Paths{}, errors.New("invalid application profile")
	}
	directory := override
	if directory == "" {
		base, err := os.UserConfigDir()
		if err != nil {
			return Paths{}, err
		}
		name := "development"
		if profile == Production {
			name = "production"
		}
		directory = filepath.Join(base, "XHSSpiderDesktop", name)
	}
	absolute, err := filepath.Abs(directory)
	if err != nil {
		return Paths{}, err
	}
	return Paths{absolute, filepath.Join(absolute, "desktop.sqlite")}, nil
}
