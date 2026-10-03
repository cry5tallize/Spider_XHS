package storage

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

type Store struct {
	writer        *sql.DB
	reader        *sql.DB
	path          string
	schemaVersion int
	closeOnce     sync.Once
	closeErr      error
}

func Open(ctx context.Context, path string) (*Store, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	absolute, err := filepath.Abs(path)
	if err != nil || path == "" {
		return nil, errors.New("database path must be a nonempty filesystem path")
	}
	if err = os.MkdirAll(filepath.Dir(absolute), 0o700); err != nil {
		return nil, err
	}
	s := &Store{path: absolute}
	s.writer, err = sql.Open("sqlite", connectionDSN(absolute, false))
	if err != nil {
		return nil, err
	}
	s.writer.SetMaxOpenConns(1)
	s.writer.SetMaxIdleConns(1)
	// Close runs on every failed initialization path, including reader failures.
	ready := false
	defer func() {
		if !ready {
			_ = s.Close()
		}
	}()
	if err = s.writer.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("open sqlite writer: %w", err)
	}
	migrations, err := embeddedMigrations()
	if err != nil {
		return nil, err
	}
	if s.schemaVersion, err = migrate(ctx, s.writer, absolute, migrations); err != nil {
		return nil, err
	}
	s.reader, err = sql.Open("sqlite", connectionDSN(absolute, true))
	if err != nil {
		return nil, err
	}
	s.reader.SetMaxOpenConns(4)
	s.reader.SetMaxIdleConns(4)
	s.reader.SetConnMaxIdleTime(5 * time.Minute)
	if err = s.reader.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("open sqlite reader: %w", err)
	}
	ready = true
	return s, nil
}

func connectionDSN(path string, readOnly bool) string {
	// URL encoding also protects spaces, '#' and '?' in user data directories.
	u := url.URL{Scheme: "file", Path: filepath.ToSlash(path)}
	if filepath.VolumeName(path) != "" {
		u.Path = "/" + u.Path
	}
	q := url.Values{}
	q.Add("_pragma", "foreign_keys(1)")
	q.Add("_pragma", "busy_timeout(5000)")
	q.Add("_pragma", "synchronous(FULL)")
	if readOnly {
		q.Set("mode", "ro")
	} else {
		q.Add("_pragma", "journal_mode(WAL)")
	}
	u.RawQuery = q.Encode()
	return u.String()
}

func (s *Store) SchemaVersion() int { return s.schemaVersion }

func (s *Store) Close() error {
	s.closeOnce.Do(func() {
		if s.reader != nil {
			s.closeErr = errors.Join(s.closeErr, s.reader.Close())
		}
		if s.writer != nil {
			s.closeErr = errors.Join(s.closeErr, s.writer.Close())
		}
	})
	return s.closeErr
}
