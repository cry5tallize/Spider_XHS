package storage

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/accounts"
	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/notes"
	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/parsing"
)

func parseFailure(f *notes.Failure) any {
	if f == nil {
		return nil
	}
	return jsonText(f)
}
func scanParseGroup(row scanner, withFingerprint bool) (parsing.Job, string, error) {
	var j parsing.Job
	var config string
	var failure sql.NullString
	var fingerprint string
	fields := []any{&j.ID, &j.Mode, &j.State, &config, &j.SourceCount, &j.Discovered, &j.Completed, &j.FailedItems, &j.SkippedItems, &j.ActiveItems, &failure, &j.LimitReason, &j.CreatedAtMS, &j.UpdatedAtMS, &j.Revision, &j.RunVersion}
	if withFingerprint {
		fields = append(fields, &fingerprint)
	}
	err := row.Scan(fields...)
	if errors.Is(err, sql.ErrNoRows) {
		return j, "", parsing.ErrNotFound
	}
	if err != nil {
		return j, "", err
	}
	if err = json.Unmarshal([]byte(config), &j.Config); err != nil {
		return j, "", err
	}
	if failure.Valid {
		err = json.Unmarshal([]byte(failure.String), &j.Failure)
	}
	return j, fingerprint, err
}
func scanParseSource(row scanner) (parsing.Source, error) {
	var s parsing.Source
	var failure sql.NullString
	err := row.Scan(&s.ID, &s.JobID, &s.Index, &s.TargetID, &s.AccountID, &s.CredentialVersion, &s.State, &s.Cursor, &s.Pages, &s.HasMore, &s.UserName, &failure, &s.LimitReason, &s.InputBlob, &s.Provider)
	if err == nil && failure.Valid {
		err = json.Unmarshal([]byte(failure.String), &s.Failure)
	}
	return s, err
}
func scanBatchItem(row scanner, preview bool) (parsing.Item, error) {
	var i parsing.Item
	var failure sql.NullString
	fields := []any{&i.ID, &i.JobID, &i.NoteID, &i.Title, &i.RawKind, &i.AccountID, &i.CredentialVersion, &i.State, &i.SnapshotID, &failure, &i.SkipReason, &i.OriginCount, &i.Ordinal, &i.PublishedAtMS, &i.RefBlob, &i.Provider}
	if preview {
		fields = append(fields, &i.AuthorID, &i.AuthorName, &i.AuthorAvatar, &i.CoverURL, &i.ImageCount, &i.VideoStreamCount, &i.HasLivePhoto, &i.LivePhotoCount)
	}
	err := row.Scan(fields...)
	if err == nil && failure.Valid {
		err = json.Unmarshal([]byte(failure.String), &i.Failure)
	}
	return i, err
}
func guardParseGroup(ctx context.Context, tx *sql.Tx, j parsing.Job) error {
	var valid int
	if err := tx.QueryRowContext(ctx, query("parse_groups/guard"), j.ID, j.RunVersion).Scan(&valid); err != nil {
		return err
	}
	if valid != 1 {
		return parsing.ErrConflict
	}
	return nil
}
func guardParseAccount(ctx context.Context, tx *sql.Tx, id string, version int64) error {
	a, err := scanAccount(tx.QueryRowContext(ctx, query("accounts/get"), id))
	if err != nil {
		return err
	}
	if !a.Enabled || a.CredentialVersion != version {
		return accounts.ErrChanged
	}
	return nil
}
func touchParseGroup(ctx context.Context, tx *sql.Tx, id string) error {
	_, err := tx.ExecContext(ctx, query("parse_groups/touch"), time.Now().UnixMilli(), id)
	return err
}
func (s *Store) CreateParseGroup(ctx context.Context, j parsing.Job, request, fingerprint string, sources []parsing.Source) error {
	tx, err := s.writer.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var count int
	if err = tx.QueryRowContext(ctx, query("parse_groups/queued_count")).Scan(&count); err != nil {
		return err
	}
	if count >= 100 {
		return errors.New("批量解析队列已满")
	}
	if _, err = tx.ExecContext(ctx, query("parse_groups/create"), j.ID, request, fingerprint, j.Mode, jsonText(j.Config), j.CreatedAtMS, j.UpdatedAtMS); err != nil {
		return err
	}
	for _, source := range sources {
		if _, err = tx.ExecContext(ctx, query("parse_groups/create_source"), source.ID, j.ID, source.Index, source.TargetID, source.AccountID, source.CredentialVersion, source.InputBlob, source.Provider, source.State, parseFailure(source.Failure)); err != nil {
			return err
		}
	}
	return tx.Commit()
}
func (s *Store) FindParseGroupRequest(ctx context.Context, id string) (parsing.Job, string, error) {
	return scanParseGroup(s.reader.QueryRowContext(ctx, query("parse_groups/find"), id), true)
}
func (s *Store) GetParseGroup(ctx context.Context, id string) (parsing.Job, error) {
	j, _, err := scanParseGroup(s.reader.QueryRowContext(ctx, query("parse_groups/get"), id), false)
	return j, err
}
func (s *Store) ListParseGroups(ctx context.Context) ([]parsing.Job, error) {
	rows, err := s.reader.QueryContext(ctx, query("parse_groups/list"))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []parsing.Job{}
	for rows.Next() {
		j, _, e := scanParseGroup(rows, false)
		if e != nil {
			return nil, e
		}
		out = append(out, j)
	}
	return out, rows.Err()
}
func (s *Store) ClaimParseGroup(ctx context.Context) (parsing.Job, error) {
	tx, err := s.writer.BeginTx(ctx, nil)
	if err != nil {
		return parsing.Job{}, err
	}
	defer tx.Rollback()
	j, _, err := scanParseGroup(tx.QueryRowContext(ctx, query("parse_groups/next")), false)
	if err != nil {
		return j, err
	}
	r, err := tx.ExecContext(ctx, query("parse_groups/claim"), time.Now().UnixMilli(), j.ID)
	if err = accountResult(r, err, parsing.ErrConflict); err != nil {
		return j, err
	}
	if err = tx.Commit(); err != nil {
		return j, err
	}
	return s.GetParseGroup(ctx, j.ID)
}
func (s *Store) ParseGroupSources(ctx context.Context, id string) ([]parsing.Source, error) {
	rows, err := s.reader.QueryContext(ctx, query("parse_groups/sources"), id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []parsing.Source{}
	for rows.Next() {
		v, e := scanParseSource(rows)
		if e != nil {
			return nil, e
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
func (s *Store) SaveParseUser(ctx context.Context, j parsing.Job, source parsing.Source, u parsing.User) error {
	tx, err := s.writer.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = guardParseGroup(ctx, tx, j); err != nil {
		return err
	}
	if err = guardParseAccount(ctx, tx, source.AccountID, source.CredentialVersion); err != nil {
		return err
	}
	at := time.Now().UnixMilli()
	if _, err = tx.ExecContext(ctx, query("notes/upsert_author"), u.ID, u.Nickname, u.AvatarURL, string(u.Raw), at, at, at); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, query("parse_groups/source_user"), u.ID, u.Nickname, source.ID); err != nil {
		return err
	}
	if err = touchParseGroup(ctx, tx, j.ID); err != nil {
		return err
	}
	return tx.Commit()
}
func writeParseSource(ctx context.Context, tx *sql.Tx, source parsing.Source) error {
	_, err := tx.ExecContext(ctx, query("parse_groups/source_finish"), source.TargetID, source.State, source.Cursor, source.Pages, source.HasMore, source.UserName, parseFailure(source.Failure), source.LimitReason, source.ID)
	return err
}
func (s *Store) SaveParsePage(ctx context.Context, j parsing.Job, source parsing.Source, items []parsing.DiscoveredItem) error {
	tx, err := s.writer.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = guardParseGroup(ctx, tx, j); err != nil {
		return err
	}
	if err = guardParseAccount(ctx, tx, source.AccountID, source.CredentialVersion); err != nil {
		return err
	}
	if source.HasMore && source.Cursor != "" {
		r, e := tx.ExecContext(ctx, query("parse_groups/cursor"), source.ID, source.Cursor)
		if err = accountResult(r, e, errors.New("用户分页游标重复")); err != nil {
			return err
		}
	}
	current, _, err := scanParseGroup(tx.QueryRowContext(ctx, query("parse_groups/get"), j.ID), false)
	if err != nil {
		return err
	}
	for _, v := range items {
		i := v.Item
		if j.Config.MaxNotes > 0 && current.Discovered >= j.Config.MaxNotes {
			var existing int
			if err = tx.QueryRowContext(ctx, query("parse_groups/item_exists"), j.ID, i.NoteID).Scan(&existing); err != nil {
				return err
			}
			if existing == 0 {
				source.State = parsing.SourceLimited
				source.LimitReason = "达到笔记数量上限"
				break
			}
		}
		r, e := tx.ExecContext(ctx, query("parse_groups/create_item"), i.ID, j.ID, i.NoteID, i.Title, i.RawKind, i.PublishedAtMS, i.AccountID, i.CredentialVersion, i.RefBlob, i.Provider, v.Priority)
		if e != nil {
			return e
		}
		n, e := r.RowsAffected()
		if e != nil {
			return e
		}
		current.Discovered += int(n)
		if _, err = tx.ExecContext(ctx, query("parse_groups/upgrade_ref"), i.RefBlob, v.Priority, j.ID, i.NoteID, i.AccountID, i.CredentialVersion, v.Priority); err != nil {
			return err
		}
		if _, err = tx.ExecContext(ctx, query("parse_groups/origin"), v.SourceID, v.RefBlob, source.Pages, j.ID, i.NoteID); err != nil {
			return err
		}
	}
	if err = writeParseSource(ctx, tx, source); err != nil {
		return err
	}
	if err = touchParseGroup(ctx, tx, j.ID); err != nil {
		return err
	}
	return tx.Commit()
}
func (s *Store) FinishParseSource(ctx context.Context, j parsing.Job, source parsing.Source) error {
	tx, err := s.writer.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = guardParseGroup(ctx, tx, j); err != nil {
		return err
	}
	if err = writeParseSource(ctx, tx, source); err != nil {
		return err
	}
	if err = touchParseGroup(ctx, tx, j.ID); err != nil {
		return err
	}
	return tx.Commit()
}
func (s *Store) PendingParseItems(ctx context.Context, id string, limit int) ([]parsing.Item, error) {
	rows, err := s.reader.QueryContext(ctx, query("parse_groups/pending"), id, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []parsing.Item{}
	for rows.Next() {
		v, e := scanBatchItem(rows, false)
		if e != nil {
			return nil, e
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
func (s *Store) ClaimParseItem(ctx context.Context, j parsing.Job, id string) error {
	tx, err := s.writer.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = guardParseGroup(ctx, tx, j); err != nil {
		return err
	}
	r, err := tx.ExecContext(ctx, query("parse_groups/claim_item"), id)
	if err = accountResult(r, err, parsing.ErrConflict); err != nil {
		return err
	}
	if err = touchParseGroup(ctx, tx, j.ID); err != nil {
		return err
	}
	return tx.Commit()
}
func writeParseItem(ctx context.Context, tx *sql.Tx, i parsing.Item, state parsing.ItemState, snapshot, reason string, failure *notes.Failure) error {
	r, err := tx.ExecContext(ctx, query("parse_groups/item_outcome"), state, nullString(snapshot), parseFailure(failure), reason, i.Title, i.RawKind, i.PublishedAtMS, i.ID)
	return accountResult(r, err, parsing.ErrConflict)
}
func (s *Store) CompleteParseItem(ctx context.Context, j parsing.Job, i parsing.Item, d notes.Detail, p notes.Payload, state parsing.ItemState, reason string) error {
	tx, err := s.writer.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = guardParseGroup(ctx, tx, j); err != nil {
		return err
	}
	if err = guardParseAccount(ctx, tx, i.AccountID, i.CredentialVersion); err != nil {
		return err
	}
	if err = saveNoteSnapshotTx(ctx, tx, d, p); err != nil {
		return err
	}
	i.Title, i.RawKind, i.PublishedAtMS = d.Note.Title, d.Note.Type, d.Note.CreatedAtMS
	if err = writeParseItem(ctx, tx, i, state, d.Snapshot.ID, reason, nil); err != nil {
		return err
	}
	if err = touchParseGroup(ctx, tx, j.ID); err != nil {
		return err
	}
	return tx.Commit()
}
func (s *Store) SetParseItemOutcome(ctx context.Context, j parsing.Job, i parsing.Item, state parsing.ItemState, snapshot, reason string, failure *notes.Failure) error {
	tx, err := s.writer.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = guardParseGroup(ctx, tx, j); err != nil {
		return err
	}
	if err = guardParseAccount(ctx, tx, i.AccountID, i.CredentialVersion); err != nil {
		return err
	}
	if err = writeParseItem(ctx, tx, i, state, snapshot, reason, failure); err != nil {
		return err
	}
	if err = touchParseGroup(ctx, tx, j.ID); err != nil {
		return err
	}
	return tx.Commit()
}
func (s *Store) FindFreshParseSnapshot(ctx context.Context, i parsing.Item, since int64) (notes.Detail, error) {
	return scanDetail(s.reader.QueryRowContext(ctx, query("parse_groups/fresh"), i.NoteID, i.AccountID, i.CredentialVersion, since))
}
func (s *Store) FinishParseGroup(ctx context.Context, j parsing.Job) error {
	tx, err := s.writer.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = guardParseGroup(ctx, tx, j); err != nil {
		return err
	}
	counts := map[int]int{}
	for _, kind := range []string{"source_states", "item_states"} {
		rows, e := tx.QueryContext(ctx, query("parse_groups/"+kind), j.ID)
		if e != nil {
			return e
		}
		base := 0
		if kind == "item_states" {
			base = 100
		}
		for rows.Next() {
			var state, n int
			if e = rows.Scan(&state, &n); e != nil {
				rows.Close()
				return e
			}
			counts[base+state] = n
		}
		e = rows.Err()
		rows.Close()
		if e != nil {
			return e
		}
	}
	state := parsing.Succeeded
	reason := ""
	bad := counts[int(parsing.SourceFailed)] + counts[100+int(parsing.ItemFailed)]
	good := counts[100+int(parsing.Complete)] + counts[100+int(parsing.Incomplete)]
	if counts[100+int(parsing.Pending)] > 0 || counts[100+int(parsing.Resolving)] > 0 {
		return parsing.ErrConflict
	}
	if bad > 0 || counts[100+int(parsing.Incomplete)] > 0 {
		state = parsing.Partial
		if good == 0 && bad > 0 {
			state = parsing.Failed
		}
	}
	if counts[int(parsing.SourceLimited)] > 0 {
		state = parsing.Limited
		reason = "达到配置上限，仍可能有更多笔记"
	}
	r, err := tx.ExecContext(ctx, query("parse_groups/finish"), state, reason, time.Now().UnixMilli(), j.ID, j.RunVersion)
	if err = accountResult(r, err, parsing.ErrConflict); err != nil {
		return err
	}
	return tx.Commit()
}
func (s *Store) StopParseGroup(ctx context.Context, id string, state parsing.State, failure *notes.Failure) error {
	if state != parsing.Paused && state != parsing.Canceled && state != parsing.Interrupted {
		return parsing.ErrConflict
	}
	tx, err := s.writer.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	r, err := tx.ExecContext(ctx, query("parse_groups/stop"), state, parseFailure(failure), time.Now().UnixMilli(), id)
	if err = accountResult(r, err, parsing.ErrConflict); err != nil {
		return err
	}
	itemState := parsing.ItemInterrupted
	if state == parsing.Canceled {
		itemState = parsing.ItemCanceled
	}
	if _, err = tx.ExecContext(ctx, query("parse_groups/stop_items"), itemState, id); err != nil {
		return err
	}
	return tx.Commit()
}
func (s *Store) ResumeParseGroup(ctx context.Context, id string, retry bool) error {
	tx, err := s.writer.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	r, err := tx.ExecContext(ctx, query("parse_groups/resume"), time.Now().UnixMilli(), id)
	if err = accountResult(r, err, parsing.ErrConflict); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, query("parse_groups/reset_items"), id); err != nil {
		return err
	}
	if retry {
		for _, name := range []string{"retry_items", "retry_sources"} {
			if _, err = tx.ExecContext(ctx, query("parse_groups/"+name), id); err != nil {
				return err
			}
		}
	}
	return tx.Commit()
}
func (s *Store) RecoverParseGroups(ctx context.Context) error {
	tx, err := s.writer.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, query("parse_groups/recover"), time.Now().UnixMilli()); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, query("parse_groups/recover_items")); err != nil {
		return err
	}
	return tx.Commit()
}
func (s *Store) ListParseItems(ctx context.Context, q parsing.ItemQuery) (parsing.ItemPage, error) {
	rows, err := s.reader.QueryContext(ctx, query("parse_groups/items"), q.JobID, q.AfterOrdinal, q.State, q.State, q.Limit+1)
	if err != nil {
		return parsing.ItemPage{}, err
	}
	defer rows.Close()
	p := parsing.ItemPage{Items: []parsing.Item{}}
	for rows.Next() {
		i, e := scanBatchItem(rows, true)
		if e != nil {
			return p, e
		}
		p.Items = append(p.Items, i)
	}
	if err = rows.Err(); err != nil {
		return p, err
	}
	if len(p.Items) > q.Limit {
		p.HasMore = true
		p.Items = p.Items[:q.Limit]
		p.NextOrdinal = p.Items[len(p.Items)-1].Ordinal
	}
	return p, nil
}
func (s *Store) ParseItemOrigins(ctx context.Context, id string) ([]parsing.Origin, error) {
	rows, err := s.reader.QueryContext(ctx, query("parse_groups/origins"), id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []parsing.Origin{}
	for rows.Next() {
		var o parsing.Origin
		if err = rows.Scan(&o.Index, &o.TargetID, &o.AccountID, &o.Pages); err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, rows.Err()
}
