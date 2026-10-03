package storage

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/settings"
)

func openTestStore(t *testing.T) *Store {
	t.Helper()
	s, err := Open(context.Background(), filepath.Join(t.TempDir(), "数据 # spaces", "app.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := s.Close(); err != nil {
			t.Error(err)
		}
	})
	return s
}

func TestSettingsPersistWithMillisecondsAndCAS(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	stamp := time.Date(2026, 10, 3, 12, 0, 0, 987000000, time.UTC)
	service := settings.NewService(s, func() time.Time { return stamp })
	if err := service.Initialize(ctx); err != nil {
		t.Fatal(err)
	}
	input := settings.UpdateGeneral{ThemeMode: settings.ThemeDark, MaxConcurrentNotes: 3, OutputDirectory: `D:\downloads`, ExpectedRevision: 1}
	g, err := service.Update(ctx, input)
	if err != nil {
		t.Fatal(err)
	}
	if g.UpdatedAtMS != stamp.UnixMilli() || g.Revision != 2 {
		t.Fatalf("metadata: %+v", g)
	}
	if _, err = service.Update(ctx, input); !errors.Is(err, settings.ErrConflict) {
		t.Fatalf("stale write: %v", err)
	}
	if err = s.Close(); err != nil {
		t.Fatal(err)
	}
	reopened, err := Open(ctx, s.path)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	loaded, err := reopened.LoadGeneral(ctx)
	if err != nil || loaded != g {
		t.Fatalf("reload: %+v, %v", loaded, err)
	}
}

func TestConcurrentSettingsWritersDoNotLoseUpdates(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	if err := settings.NewService(s, nil).Initialize(ctx); err != nil {
		t.Fatal(err)
	}
	start := make(chan struct{})
	results := make(chan error, 2)
	var wg sync.WaitGroup
	for _, count := range []int{2, 8} {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			<-start
			_, err := settings.NewService(s, nil).Update(ctx, settings.UpdateGeneral{ThemeMode: settings.ThemeSystem, MaxConcurrentNotes: n, ExpectedRevision: 1})
			results <- err
		}(count)
	}
	close(start)
	wg.Wait()
	close(results)
	success, conflict := 0, 0
	for err := range results {
		if err == nil {
			success++
		} else if errors.Is(err, settings.ErrConflict) {
			conflict++
		} else {
			t.Fatal(err)
		}
	}
	if success != 1 || conflict != 1 {
		t.Fatalf("success=%d conflict=%d", success, conflict)
	}
}

func TestPragmasApplyToEveryReaderConnectionAndClose(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	connections := make([]*sql.Conn, 0, 4)
	defer func() {
		for _, conn := range connections {
			conn.Close()
		}
	}()
	for i := 0; i < 4; i++ {
		conn, err := s.reader.Conn(ctx)
		if err != nil {
			t.Fatal(err)
		}
		connections = append(connections, conn)
		for name, expected := range map[string]int{"foreign_keys": 1, "busy_timeout": 5000, "synchronous": 2} {
			var actual int
			if err = conn.QueryRowContext(ctx, "PRAGMA "+name).Scan(&actual); err != nil || actual != expected {
				t.Fatalf("%s=%d: %v", name, actual, err)
			}
		}
	}
	for _, conn := range connections {
		conn.Close()
	}
	connections = nil
	if err := s.Close(); err != nil {
		t.Fatal(err)
	}
	if s.reader.Stats().OpenConnections != 0 || s.writer.Stats().OpenConnections != 0 {
		t.Fatal("connections leaked after close")
	}
	if err := s.Close(); err != nil {
		t.Fatal("repeated close:", err)
	}
}

func TestMigrationBackupRollbackAndChecksum(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	if err := settings.NewService(s, nil).Initialize(ctx); err != nil {
		t.Fatal(err)
	}
	base, err := embeddedMigrations()
	if err != nil {
		t.Fatal(err)
	}
	nextVersion := len(base) + 1
	bad := append(append([]migration{}, base...), migration{nextVersion, "next_bad.sql", "bad", "CREATE TABLE temporary_marker (id INTEGER); INSERT INTO missing_table VALUES (1);"})
	if _, err = migrate(ctx, s.writer, s.path, bad); err == nil {
		t.Fatal("invalid migration succeeded")
	}
	var count int
	if err = s.writer.QueryRowContext(ctx, "SELECT count(*) FROM schema_migrations").Scan(&count); err != nil || count != len(base) {
		t.Fatalf("migration history count=%d: %v", count, err)
	}
	if err = s.writer.QueryRowContext(ctx, "SELECT count(*) FROM sqlite_master WHERE name='temporary_marker'").Scan(&count); err != nil || count != 0 {
		t.Fatalf("DDL rollback count=%d: %v", count, err)
	}
	entries, err := os.ReadDir(filepath.Join(filepath.Dir(s.path), "backups"))
	if err != nil || len(entries) != 1 {
		t.Fatalf("backup files: %v, %v", entries, err)
	}
	copyDB, err := sql.Open("sqlite", connectionDSN(filepath.Join(filepath.Dir(s.path), "backups", entries[0].Name()), true))
	if err != nil {
		t.Fatal(err)
	}
	if err = copyDB.QueryRowContext(ctx, "SELECT count(*) FROM app_settings").Scan(&count); err != nil || count != 1 {
		t.Fatalf("consistent backup: count=%d, %v", count, err)
	}
	copyDB.Close()
	changed := append([]migration{}, base...)
	changed[0].checksum = "changed"
	if _, err = migrate(ctx, s.writer, s.path, changed); err == nil || !strings.Contains(err.Error(), "checksum") {
		t.Fatalf("checksum: %v", err)
	}
	good := append(append([]migration{}, base...), migration{nextVersion, "next_good.sql", "good", "CREATE TABLE upgrade_marker (id INTEGER);"})
	if version, err := migrate(ctx, s.writer, s.path, good); err != nil || version != nextVersion {
		t.Fatalf("upgrade version=%d: %v", version, err)
	}
	if _, err = migrate(ctx, s.writer, s.path, base); err == nil || !strings.Contains(err.Error(), "newer") {
		t.Fatalf("downgrade: %v", err)
	}
}

func TestCanceledOpenCreatesNoDatabase(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	path := filepath.Join(t.TempDir(), "not-created", "app.sqlite")
	if _, err := Open(ctx, path); !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Dir(path)); !os.IsNotExist(err) {
		t.Fatalf("canceled open created directory: %v", err)
	}
}
