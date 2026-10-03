package storage

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

type migration struct {
	version  int
	filename string
	checksum string
	sql      string
}

func embeddedMigrations() ([]migration, error) {
	entries, err := fs.ReadDir(sqlFiles, "sql/migrations")
	if err != nil {
		return nil, err
	}
	result := make([]migration, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		prefix, _, ok := strings.Cut(entry.Name(), "_")
		version, err := strconv.Atoi(prefix)
		if !ok || err != nil || version < 1 {
			return nil, fmt.Errorf("invalid migration filename %q", entry.Name())
		}
		data, err := sqlFiles.ReadFile("sql/migrations/" + entry.Name())
		if err != nil {
			return nil, err
		}
		canonicalSQL := strings.ReplaceAll(string(data), "\r\n", "\n")
		result = append(result, migration{version, entry.Name(), fmt.Sprintf("%x", sha256.Sum256([]byte(canonicalSQL))), canonicalSQL})
	}
	sort.Slice(result, func(i, j int) bool { return result[i].version < result[j].version })
	for i, m := range result {
		if m.version != i+1 {
			return nil, fmt.Errorf("noncontiguous migrations at %q", m.filename)
		}
	}
	return result, nil
}

func migrate(ctx context.Context, db *sql.DB, path string, available []migration) (int, error) {
	if _, err := db.ExecContext(ctx, query("schema/create_tracking")); err != nil {
		return 0, err
	}
	rows, err := db.QueryContext(ctx, query("schema/list_migrations"))
	if err != nil {
		return 0, err
	}
	current := 0
	for rows.Next() {
		var version int
		var filename, checksum string
		if err = rows.Scan(&version, &filename, &checksum); err != nil {
			break
		}
		if version > len(available) {
			err = fmt.Errorf("database schema %d is newer than supported schema %d", version, len(available))
			break
		}
		if version != current+1 || version < 1 {
			err = fmt.Errorf("invalid migration history at version %d", version)
			break
		}
		m := available[version-1]
		if m.version != version || m.filename != filename || m.checksum != checksum {
			err = fmt.Errorf("migration checksum mismatch at version %d", version)
			break
		}
		current = version
	}
	rowErr := rows.Err()
	closeErr := rows.Close() // Release the single writer connection before BeginTx/backup.
	if err != nil {
		return current, err
	}
	if rowErr != nil {
		return current, rowErr
	}
	if closeErr != nil {
		return current, closeErr
	}
	if current > 0 && current < len(available) {
		if err = backup(ctx, db, path); err != nil {
			return current, fmt.Errorf("backup before migration: %w", err)
		}
	}
	for _, m := range available[current:] {
		if err = applyMigration(ctx, db, m); err != nil {
			return current, fmt.Errorf("migration %s: %w", m.filename, err)
		}
		current = m.version
	}
	return current, nil
}

func applyMigration(ctx context.Context, db *sql.DB, m migration) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, m.sql); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, query("schema/record_migration"), m.version, m.filename, m.checksum, time.Now().UnixMilli()); err != nil {
		return err
	}
	return tx.Commit()
}

func backup(ctx context.Context, db *sql.DB, path string) error {
	directory := filepath.Join(filepath.Dir(path), "backups")
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return err
	}
	target := filepath.Join(directory, fmt.Sprintf("before-upgrade-%d-%s.sqlite", time.Now().UnixMilli(), rand.Text()))
	_, err := db.ExecContext(ctx, query("schema/backup"), target)
	return err
}
