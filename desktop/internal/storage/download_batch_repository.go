package storage

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/downloads"
	"time"
)

func (s *Store) FindDownloadBatch(ctx context.Context, request string) (downloads.Batch, string, error) {
	var b downloads.Batch
	var fingerprint string
	err := s.reader.QueryRowContext(ctx, query("downloads/find_batch"), request).Scan(&b.ID, &fingerprint, &b.CreatedAtMS)
	if errors.Is(err, sql.ErrNoRows) {
		err = downloads.ErrNotFound
	}
	if err != nil {
		return b, "", err
	}
	rows, err := s.reader.QueryContext(ctx, query("downloads/batch_tasks"), b.ID)
	if err != nil {
		return b, "", err
	}
	defer rows.Close()
	b.TaskIDs = []string{}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			return b, "", err
		}
		b.TaskIDs = append(b.TaskIDs, id)
	}
	return b, fingerprint, rows.Err()
}
func (s *Store) CreateDownloadBatch(ctx context.Context, b downloads.Batch, request, fingerprint string, plans []downloads.Plan) error {
	tx, err := s.writer.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var queued int
	if err = tx.QueryRowContext(ctx, query("downloads/queued_count")).Scan(&queued); err != nil {
		return err
	}
	if queued+len(plans) > 1000 {
		return errors.New("下载队列容量不足，请分批提交")
	}
	if _, err = tx.ExecContext(ctx, query("downloads/create_batch"), b.ID, request, fingerprint, b.CreatedAtMS); err != nil {
		return err
	}
	for index, p := range plans {
		if err = createDownloadTaskTx(ctx, tx, b.TaskIDs[index], b.ID+"/"+p.NoteID, b.ID, p, b.CreatedAtMS); err != nil {
			return err
		}
	}
	return tx.Commit()
}
func (s *Store) ListDownloadPresets(ctx context.Context) ([]downloads.Preset, error) {
	rows, err := s.reader.QueryContext(ctx, query("downloads/list_presets"))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []downloads.Preset{}
	for rows.Next() {
		var p downloads.Preset
		var config string
		if err = rows.Scan(&p.ID, &p.Name, &config, &p.UpdatedAtMS); err != nil {
			return nil, err
		}
		if err = json.Unmarshal([]byte(config), &p.Config); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
func (s *Store) SaveDownloadPreset(ctx context.Context, p downloads.Preset) error {
	_, err := s.writer.ExecContext(ctx, query("downloads/save_preset"), p.ID, p.Name, jsonText(p.Config), time.Now().UnixMilli())
	return err
}
func (s *Store) DeleteDownloadPreset(ctx context.Context, id string) error {
	r, err := s.writer.ExecContext(ctx, query("downloads/delete_preset"), id)
	return accountResult(r, err, downloads.ErrNotFound)
}
