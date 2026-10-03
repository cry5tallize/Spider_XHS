package storage

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/settings"
)

func (s *Store) LoadGeneral(ctx context.Context) (settings.General, error) {
	var value settings.General
	var raw string
	var version int
	var revision, updatedAtMS int64
	err := s.reader.QueryRowContext(ctx, query("settings/get_general")).Scan(&version, &raw, &revision, &updatedAtMS)
	if errors.Is(err, sql.ErrNoRows) {
		return value, settings.ErrNotFound
	}
	if err != nil {
		return value, err
	}
	if err = json.Unmarshal([]byte(raw), &value); err != nil {
		return value, fmt.Errorf("decode general settings: %w", err)
	}
	if value.SchemaVersion != version || value.Revision != revision || value.UpdatedAtMS != updatedAtMS {
		return value, errors.New("settings metadata mismatch")
	}
	return value, value.Validate()
}

func (s *Store) SaveGeneral(ctx context.Context, value settings.General, expected int64) error {
	if err := value.Validate(); err != nil {
		return err
	}
	if value.Revision != expected+1 {
		return settings.ErrConflict
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return err
	}
	result, err := s.writer.ExecContext(ctx, query("settings/save_general"), value.SchemaVersion, string(raw), value.Revision, value.UpdatedAtMS, expected, expected, expected)
	if err != nil {
		return err
	}
	n, err := result.RowsAffected()
	if err == nil && n != 1 {
		return settings.ErrConflict
	}
	return err
}
