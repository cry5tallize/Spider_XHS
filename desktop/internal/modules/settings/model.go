package settings

import (
	"errors"
	"path/filepath"
	"strings"
)

type ThemeMode int8

const (
	ThemeUnknown ThemeMode = 0
	ThemeSystem  ThemeMode = 1
	ThemeLight   ThemeMode = 2
	ThemeDark    ThemeMode = 3
)

var (
	ErrConflict = errors.New("settings changed; reload before saving")
	ErrNotFound = errors.New("settings not initialized")
)

// General contains application settings, not a running task's config snapshot.
type General struct {
	SchemaVersion      int       `json:"schema_version"`
	ThemeMode          ThemeMode `json:"theme_mode"`
	MaxConcurrentNotes int       `json:"max_concurrent_notes"`
	OutputDirectory    string    `json:"output_directory"`
	Revision           int64     `json:"revision"`
	UpdatedAtMS        int64     `json:"updated_at_ms"`
}

type UpdateGeneral struct {
	ThemeMode          ThemeMode `json:"theme_mode"`
	MaxConcurrentNotes int       `json:"max_concurrent_notes"`
	OutputDirectory    string    `json:"output_directory"`
	ExpectedRevision   int64     `json:"expected_revision"`
}

func Defaults() General {
	return General{SchemaVersion: 1, ThemeMode: ThemeSystem, MaxConcurrentNotes: 4}
}

func (g General) Validate() error {
	if g.SchemaVersion != 1 {
		return errors.New("unsupported settings schema")
	}
	if g.ThemeMode < ThemeSystem || g.ThemeMode > ThemeDark {
		return errors.New("invalid theme mode")
	}
	if g.MaxConcurrentNotes < 1 || g.MaxConcurrentNotes > 32 {
		return errors.New("concurrent notes must be between 1 and 32")
	}
	if strings.ContainsRune(g.OutputDirectory, '\x00') {
		return errors.New("invalid output directory")
	}
	if g.OutputDirectory != "" && !filepath.IsAbs(g.OutputDirectory) {
		return errors.New("output directory must be an absolute path")
	}
	if g.Revision < 0 || g.UpdatedAtMS < 0 {
		return errors.New("invalid settings metadata")
	}
	return nil
}
