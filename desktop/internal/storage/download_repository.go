package storage

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/downloads"
)

func outputKey(path string) string {
	path = filepath.Clean(path)
	if runtime.GOOS == "windows" {
		path = strings.ToLower(path)
	}
	return path
}
func jsonText(value any) string {
	body, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	return string(body)
}
func failureJSON(f *downloads.Failure) any {
	if f == nil {
		return nil
	}
	return jsonText(f)
}
func scanTask(row scanner) (downloads.Task, error) {
	var t downloads.Task
	var config, pairs string
	var failure sql.NullString
	err := row.Scan(&t.ID, &t.NoteID, &t.SnapshotID, &t.Title, &t.AuthorID, &t.AuthorName, &t.AccountID, &t.State, &config, &t.RelativeDirectory, &t.PlanHash, &t.PlannedItems,
		&t.SuccessfulItems, &t.SkippedItems, &t.FailedItems, &t.FulfilledItems, &t.CompletedBytes, &t.TransferredBytes, &t.CurrentItemID, &t.CurrentSequence, &t.CurrentBytes, &t.CurrentTotal, &failure,
		&t.CreatedAtMS, &t.StartedAtMS, &t.FinishedAtMS, &t.UpdatedAtMS, &t.Revision, &t.BatchID, &pairs)
	if errors.Is(err, sql.ErrNoRows) {
		return t, downloads.ErrNotFound
	}
	if err != nil {
		return t, err
	}
	if err = json.Unmarshal([]byte(config), &t.Config); err != nil {
		return t, err
	}
	if failure.Valid {
		err = json.Unmarshal([]byte(failure.String), &t.Failure)
	}
	if err == nil {
		err = json.Unmarshal([]byte(pairs), &t.LivePairs)
	}
	return t, err
}
func scanDownloadItem(row scanner) (downloads.Item, error) {
	var i downloads.Item
	var plan, result string
	var failure sql.NullString
	var inline []byte
	err := row.Scan(&i.ID, &i.TaskID, &plan, &inline, &i.State, &i.TransferredBytes, &i.CurrentBytes, &i.CurrentTotal, &result, &failure, &i.Attempts)
	if errors.Is(err, sql.ErrNoRows) {
		return i, downloads.ErrNotFound
	}
	if err != nil {
		return i, err
	}
	if err = json.Unmarshal([]byte(plan), &i.PlannedItem); err != nil {
		return i, err
	}
	i.Inline = inline
	if err = json.Unmarshal([]byte(result), &i.Result); err != nil {
		return i, err
	}
	if failure.Valid {
		err = json.Unmarshal([]byte(failure.String), &i.Failure)
	}
	return i, err
}
func (s *Store) CreateDownloadTask(ctx context.Context, id, request string, p downloads.Plan) error {
	tx, err := s.writer.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var count int
	if err = tx.QueryRowContext(ctx, query("downloads/queued_count")).Scan(&count); err != nil {
		return err
	}
	if count >= 1000 {
		return errors.New("下载队列已满，请稍后创建")
	}
	at := time.Now().UnixMilli()
	if err = createDownloadTaskTx(ctx, tx, id, request, "", p, at); err != nil {
		return err
	}
	return tx.Commit()
}
func createDownloadTaskTx(ctx context.Context, tx *sql.Tx, id, request, batch string, p downloads.Plan, at int64) error {
	if p.LivePairs == nil {
		p.LivePairs = []downloads.LivePair{}
	}
	if _, err := tx.ExecContext(ctx, query("downloads/create_task"), id, request, p.NoteID, p.SnapshotID, p.Title, nullString(p.AuthorID), p.AuthorName, nullString(p.AccountID), downloads.Queued, jsonText(p.Config), p.RelativeDirectory, p.Hash, outputKey(p.Config.Output.Directory), len(p.Items), at, at, nullString(batch), jsonText(p.LivePairs)); err != nil {
		return err
	}
	for _, item := range p.Items {
		if _, err := tx.ExecContext(ctx, query("downloads/create_item"), rand.Text(), id, item.Sequence, item.Kind, item.AssetKey, item.Confidence, jsonText(item), item.Inline, at, at); err != nil {
			return err
		}
	}
	return nil
}
func (s *Store) GetDownloadTask(ctx context.Context, id string) (downloads.Task, error) {
	return scanTask(s.reader.QueryRowContext(ctx, query("downloads/get"), id))
}
func (s *Store) FindDownloadRequest(ctx context.Context, id string) (downloads.Task, error) {
	return scanTask(s.reader.QueryRowContext(ctx, query("downloads/find_request"), id))
}
func (s *Store) ListDownloadTasks(ctx context.Context, input downloads.ListInput, history bool) (downloads.Page, error) {
	name := "downloads/list"
	if history {
		name = "downloads/history"
	}
	rows, err := s.reader.QueryContext(ctx, query(name), input.BeforeAtMS, input.BeforeAtMS, input.BeforeID, input.State, input.State, input.NoteID, input.NoteID, input.AuthorID, input.AuthorID, input.Limit+1)
	if err != nil {
		return downloads.Page{}, err
	}
	defer rows.Close()
	p := downloads.Page{Items: []downloads.Task{}}
	for rows.Next() {
		t, err := scanTask(rows)
		if err != nil {
			return p, err
		}
		p.Items = append(p.Items, t)
	}
	if err = rows.Err(); err != nil {
		return p, err
	}
	if len(p.Items) > input.Limit {
		p.HasMore = true
		p.Items = p.Items[:input.Limit]
		last := p.Items[len(p.Items)-1]
		p.NextAtMS, p.NextID = last.CreatedAtMS, last.ID
		if history && last.StartedAtMS != nil {
			p.NextAtMS = *last.StartedAtMS
		}
	}
	return p, nil
}
func (s *Store) ActiveDownloadTasks(ctx context.Context) ([]downloads.Task, error) {
	rows, err := s.reader.QueryContext(ctx, query("downloads/active"))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []downloads.Task{}
	for rows.Next() {
		t, err := scanTask(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}
func (s *Store) ClaimDownloadTask(ctx context.Context) (downloads.Task, error) {
	tx, err := s.writer.BeginTx(ctx, nil)
	if err != nil {
		return downloads.Task{}, err
	}
	defer tx.Rollback()
	t, err := scanTask(tx.QueryRowContext(ctx, query("downloads/next")))
	if err != nil {
		return t, err
	}
	at := time.Now().UnixMilli()
	if _, err = tx.ExecContext(ctx, query("downloads/claim_note"), t.NoteID, t.ID, at); err != nil {
		return t, err
	}
	r, err := tx.ExecContext(ctx, query("downloads/start_task"), at, at, t.ID)
	if err = accountResult(r, err, downloads.ErrConflict); err != nil {
		return t, err
	}
	if _, err = tx.ExecContext(ctx, query("downloads/start_history"), t.ID, at); err != nil {
		return t, err
	}
	if err = tx.Commit(); err != nil {
		return t, err
	}
	return s.GetDownloadTask(ctx, t.ID)
}
func (s *Store) DownloadItems(ctx context.Context, id string) ([]downloads.Item, error) {
	rows, err := s.reader.QueryContext(ctx, query("downloads/items"), id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []downloads.Item{}
	for rows.Next() {
		i, err := scanDownloadItem(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, i)
	}
	return out, rows.Err()
}
func (s *Store) GetDownloadItem(ctx context.Context, id string) (downloads.Item, error) {
	return scanDownloadItem(s.reader.QueryRowContext(ctx, query("downloads/get_item"), id))
}
func (s *Store) StartDownloadItem(ctx context.Context, t downloads.Task, i downloads.Item) error {
	tx, err := s.writer.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	at := time.Now().UnixMilli()
	// The claim is atomic with the item state change. A duplicate path is a
	// scheduling conflict, not permission to overwrite another active file.
	r, err := tx.ExecContext(ctx, query("downloads/claim_path"), outputKey(filepath.Join(t.Config.Output.Directory, i.RelativePath)), t.ID, i.ID)
	if err = accountResult(r, err, downloads.ErrBusy); err != nil {
		return err
	}
	r, err = tx.ExecContext(ctx, query("downloads/start_item"), at, i.ID)
	if err = accountResult(r, err, downloads.ErrConflict); err != nil {
		return err
	}
	r, err = tx.ExecContext(ctx, query("downloads/current"), i.ID, i.Sequence, at, t.ID)
	if err = accountResult(r, err, downloads.ErrConflict); err != nil {
		return err
	}
	return tx.Commit()
}
func (s *Store) CheckpointDownload(ctx context.Context, t downloads.Task, i downloads.Item) error {
	tx, err := s.writer.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	at := time.Now().UnixMilli()
	if _, err = tx.ExecContext(ctx, query("downloads/checkpoint_item"), i.TransferredBytes, i.CurrentBytes, i.CurrentTotal, at, i.ID); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, query("downloads/checkpoint_task"), t.TransferredBytes, i.CurrentBytes, i.CurrentTotal, at, t.ID); err != nil {
		return err
	}
	return tx.Commit()
}
func (s *Store) SaveDownloadAttempt(ctx context.Context, a downloads.Attempt) error {
	tx, err := s.writer.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, query("downloads/attempt"), a.ItemID, a.Number, a.EndpointIndex, a.Status, a.Error, a.StartedAtMS, a.FinishedAtMS); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, query("downloads/attempt_count"), a.Number, a.ItemID); err != nil {
		return err
	}
	return tx.Commit()
}
func (s *Store) FinalizeDownloadItem(ctx context.Context, id string, p downloads.Prepared) error {
	tx, err := s.writer.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	at := time.Now().UnixMilli()
	r, err := tx.ExecContext(ctx, query("downloads/finalizing"), at, id)
	if err = accountResult(r, err, downloads.ErrConflict); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, query("downloads/journal"), id, p.TemporaryPath, p.Bytes, p.SHA256, at); err != nil {
		return err
	}
	return tx.Commit()
}
func (s *Store) DownloadJournals(ctx context.Context) ([]downloads.FinalizeEntry, error) {
	rows, err := s.reader.QueryContext(ctx, query("downloads/journals"))
	if err != nil {
		return nil, err
	}
	var pending []struct {
		id string
		p  downloads.Prepared
	}
	for rows.Next() {
		var v struct {
			id string
			p  downloads.Prepared
		}
		if err = rows.Scan(&v.id, &v.p.TemporaryPath, &v.p.Bytes, &v.p.SHA256); err != nil {
			rows.Close()
			return nil, err
		}
		pending = append(pending, v)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	out := []downloads.FinalizeEntry{}
	for _, v := range pending {
		i, err := s.GetDownloadItem(ctx, v.id)
		if err != nil {
			return nil, err
		}
		t, err := s.GetDownloadTask(ctx, i.TaskID)
		if err != nil {
			return nil, err
		}
		out = append(out, downloads.FinalizeEntry{Item: i, Task: t, Prepared: v.p})
	}
	return out, nil
}
func refreshDownloads(ctx context.Context, tx *sql.Tx, id string, at int64) error {
	_, err := tx.ExecContext(ctx, query("downloads/refresh"), id, id, id, id, id, id, at, id)
	return err
}
func (s *Store) SettleDownloadItem(ctx context.Context, i downloads.Item, state downloads.ItemState, result downloads.Result, failure *downloads.Failure) error {
	tx, err := s.writer.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	at := time.Now().UnixMilli()
	r, err := tx.ExecContext(ctx, query("downloads/settle"), state, jsonText(result), failureJSON(failure), at, at, i.ID)
	if err = accountResult(r, err, downloads.ErrConflict); err != nil {
		return err
	}
	for _, name := range []string{"history_item", "release_path", "delete_journal"} {
		if _, err = tx.ExecContext(ctx, query("downloads/"+name), i.ID); err != nil {
			return err
		}
	}
	if err = refreshDownloads(ctx, tx, i.TaskID, at); err != nil {
		return err
	}
	return tx.Commit()
}
func (s *Store) FinishDownloadTask(ctx context.Context, id string, state downloads.State, failure *downloads.Failure) error {
	tx, err := s.writer.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	at := time.Now().UnixMilli()
	r, err := tx.ExecContext(ctx, query("downloads/finish_task"), state, failureJSON(failure), at, at, id)
	if err = accountResult(r, err, downloads.ErrConflict); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, query("downloads/stop_files"), downloads.ItemCanceled, at, id); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, query("downloads/history_all"), id); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, query("downloads/release_note"), id); err != nil {
		return err
	}
	return tx.Commit()
}
func (s *Store) StopDownloadTask(ctx context.Context, id string, state downloads.State) error {
	if state != downloads.Paused && state != downloads.Canceled && state != downloads.Interrupted {
		return downloads.ErrConflict
	}
	tx, err := s.writer.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	at := time.Now().UnixMilli()
	var finished any
	if state == downloads.Canceled || state == downloads.Interrupted {
		finished = at
	}
	r, err := tx.ExecContext(ctx, query("downloads/stop_task"), state, finished, at, id)
	if err = accountResult(r, err, downloads.ErrConflict); err != nil {
		return err
	}
	itemstate := downloads.ItemPaused
	if state == downloads.Canceled {
		itemstate = downloads.ItemCanceled
	}
	if state == downloads.Interrupted {
		itemstate = downloads.ItemInterrupted
	}
	if _, err = tx.ExecContext(ctx, query("downloads/stop_files"), itemstate, at, id); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, query("downloads/history_all"), id); err != nil {
		return err
	}
	for _, name := range []string{"release_note", "release_task_paths"} {
		if _, err = tx.ExecContext(ctx, query("downloads/"+name), id); err != nil {
			return err
		}
	}
	if err = refreshDownloads(ctx, tx, id, at); err != nil {
		return err
	}
	return tx.Commit()
}
func (s *Store) AbandonDownloadFinalization(ctx context.Context, id string) error {
	tx, err := s.writer.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, query("downloads/abandon_finalize"), failureJSON(&downloads.Failure{Kind: downloads.ErrorFileSystem, Message: "上次提交的文件无法校验，需要重新下载"}), time.Now().UnixMilli(), id); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, query("downloads/delete_journal"), id); err != nil {
		return err
	}
	return tx.Commit()
}
func (s *Store) ResumeDownloadTask(ctx context.Context, id string) error {
	tx, err := s.writer.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	at := time.Now().UnixMilli()
	r, err := tx.ExecContext(ctx, query("downloads/resume"), at, id)
	if err = accountResult(r, err, downloads.ErrConflict); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, query("downloads/reset_files"), at, id); err != nil {
		return err
	}
	if err = refreshDownloads(ctx, tx, id, at); err != nil {
		return err
	}
	return tx.Commit()
}
func (s *Store) CoveredDownloadFiles(ctx context.Context, t downloads.Task, i downloads.Item) ([]downloads.CoveredFile, error) {
	rows, err := s.reader.QueryContext(ctx, query("downloads/covered"), i.AssetKey, t.NoteID, outputKey(t.Config.Output.Directory))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []downloads.CoveredFile{}
	for rows.Next() {
		var f downloads.CoveredFile
		var raw string
		if err = rows.Scan(&f.ID, &raw); err != nil {
			return nil, err
		}
		if err = json.Unmarshal([]byte(raw), &f.Result); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}
func (s *Store) RecoverDownloads(ctx context.Context) error {
	tx, err := s.writer.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	at := time.Now().UnixMilli()
	if _, err = tx.ExecContext(ctx, query("downloads/recover_tasks"), at, at); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, query("downloads/recover_files"), at); err != nil {
		return err
	}
	for _, name := range []string{"clear_notes", "clear_paths"} {
		if _, err = tx.ExecContext(ctx, query("downloads/"+name)); err != nil {
			return err
		}
	}
	return tx.Commit()
}
