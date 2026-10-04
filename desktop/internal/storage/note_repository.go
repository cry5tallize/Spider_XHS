package storage

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"

	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/accounts"
	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/notes"
)

func nullString(s string) any {
	if s == "" {
		return nil
	}
	return s
}
func (s *Store) SaveNoteSnapshot(ctx context.Context, job string, d notes.Detail, p notes.Payload) error {
	tx, err := s.writer.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = saveNoteSnapshotTx(ctx, tx, d, p); err != nil {
		return err
	}
	if job != "" {
		at := d.Snapshot.FetchedAtMS
		r, e := tx.ExecContext(ctx, query("parsing/complete"), d.Snapshot.ID, at, at, job)
		if err = accountResult(r, e, notes.ErrConflict); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func saveNoteSnapshotTx(ctx context.Context, tx *sql.Tx, d notes.Detail, p notes.Payload) error {
	pretty, err := json.Marshal(d.Note)
	if err != nil {
		return err
	}
	warnings, err := json.Marshal(d.Snapshot.Warnings)
	if err != nil {
		return err
	}
	profile, err := json.Marshal(d.Note.User)
	if err != nil {
		return err
	}
	if d.Snapshot.AccountID != "" {
		account, err := scanAccount(tx.QueryRowContext(ctx, query("accounts/get"), d.Snapshot.AccountID))
		if err != nil {
			return err
		}
		if !account.Enabled || account.CredentialVersion != d.Snapshot.CredentialVersion {
			return accounts.ErrChanged
		}
	}
	projection := notes.Project(d)
	at := d.Snapshot.FetchedAtMS
	if projection.AuthorID != "" {
		if _, err = tx.ExecContext(ctx, query("notes/upsert_author"), projection.AuthorID, d.Note.User.Nickname, d.Note.User.AvatarURL, string(profile), at, at, at); err != nil {
			return err
		}
	}
	if _, err = tx.ExecContext(ctx, query("notes/upsert_note"), projection.ID, nullString(projection.AuthorID), projection.Kind, projection.RawKind, projection.Title, projection.Description,
		projection.HasLivePhoto, projection.ImageCount, projection.VideoStreamCount, projection.MotionStreamCount, projection.CoverURL, projection.PublishedAtMS, projection.ModifiedAtMS,
		at, d.Snapshot.ID, at, at); err != nil {
		return err
	}
	var version any
	raw := p.Raw
	if len(raw) == 0 {
		raw = []byte("null")
	}
	if d.Snapshot.AccountID != "" {
		version = d.Snapshot.CredentialVersion
	}
	if _, err = tx.ExecContext(ctx, query("notes/create_snapshot"), d.Snapshot.ID, d.Snapshot.NoteID, d.Snapshot.ParserVersion, nullString(d.Snapshot.AccountID), version,
		string(pretty), string(raw), d.Snapshot.RawSHA256, string(warnings), at); err != nil {
		return err
	}
	return nil
}
func (s *Store) ListNotes(ctx context.Context, input notes.ListInput) (notes.Page, error) {
	rows, err := s.reader.QueryContext(ctx, query("notes/list"), input.BeforeAtMS, input.BeforeAtMS, input.BeforeID, input.Limit+1)
	if err != nil {
		return notes.Page{}, err
	}
	defer rows.Close()
	page := notes.Page{Items: []notes.Summary{}}
	for rows.Next() {
		var n notes.Summary
		if err = rows.Scan(&n.ID, &n.AuthorID, &n.AuthorName, &n.Kind, &n.RawKind, &n.Title, &n.Description, &n.HasLivePhoto, &n.ImageCount, &n.VideoStreamCount, &n.MotionStreamCount,
			&n.CoverURL, &n.PublishedAtMS, &n.ModifiedAtMS, &n.FetchedAtMS, &n.SnapshotID); err != nil {
			return notes.Page{}, err
		}
		page.Items = append(page.Items, n)
	}
	if err = rows.Err(); err != nil {
		return notes.Page{}, err
	}
	if len(page.Items) > input.Limit {
		page.HasMore = true
		page.Items = page.Items[:input.Limit]
		last := page.Items[len(page.Items)-1]
		page.NextAtMS, page.NextID = last.FetchedAtMS, last.ID
	}
	return page, nil
}
func scanDetail(row scanner) (notes.Detail, error) {
	var d notes.Detail
	var pretty, warnings string
	err := row.Scan(&d.Snapshot.ID, &d.Snapshot.NoteID, &d.Snapshot.AccountID, &d.Snapshot.CredentialVersion, &d.Snapshot.ParserVersion, &warnings, &d.Snapshot.FetchedAtMS, &d.Snapshot.RawSHA256, &pretty)
	d.Snapshot.RawAvailable = d.Snapshot.RawSHA256 != ""
	if errors.Is(err, sql.ErrNoRows) {
		return d, notes.ErrNotFound
	}
	if err != nil {
		return d, err
	}
	if err = json.Unmarshal([]byte(warnings), &d.Snapshot.Warnings); err != nil {
		return d, err
	}
	return d, json.Unmarshal([]byte(pretty), &d.Note)
}
func (s *Store) GetNote(ctx context.Context, id string) (notes.Detail, error) {
	return scanDetail(s.reader.QueryRowContext(ctx, query("notes/get"), id))
}
func (s *Store) GetSnapshot(ctx context.Context, id string) (notes.Detail, error) {
	return scanDetail(s.reader.QueryRowContext(ctx, query("notes/get_snapshot"), id))
}
func (s *Store) ListSnapshots(ctx context.Context, id string) ([]notes.Snapshot, error) {
	rows, err := s.reader.QueryContext(ctx, query("notes/list_snapshots"), id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []notes.Snapshot{}
	for rows.Next() {
		var n notes.Snapshot
		var warnings string
		if err = rows.Scan(&n.ID, &n.NoteID, &n.AccountID, &n.CredentialVersion, &n.ParserVersion, &warnings, &n.FetchedAtMS, &n.RawSHA256); err != nil {
			return nil, err
		}
		if err = json.Unmarshal([]byte(warnings), &n.Warnings); err != nil {
			return nil, err
		}
		n.RawAvailable = n.RawSHA256 != ""
		out = append(out, n)
	}
	return out, rows.Err()
}
func (s *Store) GetRawSnapshot(ctx context.Context, id string) (string, error) {
	var raw string
	err := s.reader.QueryRowContext(ctx, query("notes/get_raw"), id).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		err = notes.ErrNotFound
	}
	if err == nil && raw == "null" {
		return "", notes.ErrRawUnavailable
	}
	return raw, err
}
