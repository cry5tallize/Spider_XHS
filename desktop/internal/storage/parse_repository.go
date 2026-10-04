package storage

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"

	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/notes"
)

func scanParseJob(row scanner) (notes.ParseJob, error) {
	var job notes.ParseJob
	var failure sql.NullString
	err := row.Scan(&job.ID, &job.RequestID, &job.AccountID, &job.NoteID, &job.SnapshotID, &job.State, &failure, &job.CreatedAtMS, &job.StartedAtMS, &job.FinishedAtMS, &job.UpdatedAtMS, &job.Revision)
	if errors.Is(err, sql.ErrNoRows) {
		return job, notes.ErrNotFound
	}
	if err != nil {
		return job, err
	}
	if failure.Valid {
		err = json.Unmarshal([]byte(failure.String), &job.Failure)
	}
	return job, err
}
func (s *Store) CreateParseJob(ctx context.Context, job notes.ParseJob) error {
	_, err := s.writer.ExecContext(ctx, query("parsing/create"), job.ID, job.RequestID, job.AccountID, job.NoteID, job.State, job.CreatedAtMS, job.UpdatedAtMS, job.Revision)
	return err
}
func (s *Store) GetParseJob(ctx context.Context, id string) (notes.ParseJob, error) {
	return scanParseJob(s.reader.QueryRowContext(ctx, query("parsing/get"), id))
}
func (s *Store) FindParseRequest(ctx context.Context, id string) (notes.ParseJob, error) {
	return scanParseJob(s.reader.QueryRowContext(ctx, query("parsing/find_request"), id))
}
func (s *Store) ListParseJobs(ctx context.Context) ([]notes.ParseJob, error) {
	rows, err := s.reader.QueryContext(ctx, query("parsing/list"))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []notes.ParseJob{}
	for rows.Next() {
		job, err := scanParseJob(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, job)
	}
	return out, rows.Err()
}
func (s *Store) StartParseJob(ctx context.Context, id string, at int64) error {
	r, err := s.writer.ExecContext(ctx, query("parsing/start"), at, at, id)
	return accountResult(r, err, notes.ErrConflict)
}
func (s *Store) FinishParseJob(ctx context.Context, id string, state notes.ParseState, failure *notes.Failure, at int64) error {
	if state != notes.ParseFailed && state != notes.ParseCanceled {
		return notes.ErrConflict
	}
	var encoded any
	if failure != nil {
		data, err := json.Marshal(failure)
		if err != nil {
			return err
		}
		encoded = string(data)
	}
	r, err := s.writer.ExecContext(ctx, query("parsing/finish"), state, encoded, at, at, id)
	return accountResult(r, err, notes.ErrConflict)
}
func (s *Store) InterruptParseJobs(ctx context.Context, at int64) error {
	_, err := s.writer.ExecContext(ctx, query("parsing/interrupt"), at, at)
	return err
}
