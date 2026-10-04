CREATE TABLE download_tasks (
 id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE,
 note_id TEXT NOT NULL REFERENCES notes(note_id), snapshot_id TEXT NOT NULL REFERENCES note_snapshots(id),
 title TEXT NOT NULL, author_user_id TEXT REFERENCES authors(user_id), author_name TEXT NOT NULL,
 account_id TEXT REFERENCES accounts(id),
 state INTEGER NOT NULL CHECK(state BETWEEN 0 AND 10), config_json TEXT NOT NULL CHECK(json_valid(config_json)),
 relative_directory TEXT NOT NULL, plan_hash TEXT NOT NULL, output_root_key TEXT NOT NULL,
 planned_items INTEGER NOT NULL CHECK(planned_items>0), successful_items INTEGER NOT NULL DEFAULT 0,
 skipped_items INTEGER NOT NULL DEFAULT 0, failed_items INTEGER NOT NULL DEFAULT 0, fulfilled_items INTEGER NOT NULL DEFAULT 0,
 completed_bytes INTEGER NOT NULL DEFAULT 0 CHECK(completed_bytes>=0), transferred_bytes INTEGER NOT NULL DEFAULT 0 CHECK(transferred_bytes>=0),
 current_item_id TEXT NOT NULL DEFAULT '', current_sequence INTEGER NOT NULL DEFAULT 0, current_bytes INTEGER NOT NULL DEFAULT 0,
 current_total INTEGER, error_json TEXT CHECK(error_json IS NULL OR json_valid(error_json)),
 created_at_ms INTEGER NOT NULL, started_at_ms INTEGER, finished_at_ms INTEGER, updated_at_ms INTEGER NOT NULL,
 revision INTEGER NOT NULL CHECK(revision>0)
);
CREATE TABLE download_files (
 id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES download_tasks(id), item_sequence INTEGER NOT NULL CHECK(item_sequence>0),
 media_kind INTEGER NOT NULL CHECK(media_kind BETWEEN 1 AND 7), asset_key TEXT NOT NULL,
 identity_confidence INTEGER NOT NULL CHECK(identity_confidence IN (0,1,2)),
 plan_json TEXT NOT NULL CHECK(json_valid(plan_json)), inline_blob BLOB,
 state INTEGER NOT NULL CHECK(state BETWEEN 0 AND 10), transferred_bytes INTEGER NOT NULL DEFAULT 0,
 current_bytes INTEGER NOT NULL DEFAULT 0, current_total INTEGER,
 result_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(result_json)), error_json TEXT CHECK(error_json IS NULL OR json_valid(error_json)),
 attempts INTEGER NOT NULL DEFAULT 0, created_at_ms INTEGER NOT NULL, completed_at_ms INTEGER, updated_at_ms INTEGER NOT NULL,
 UNIQUE(task_id,item_sequence)
);
CREATE UNIQUE INDEX download_files_one_running ON download_files(task_id) WHERE state IN (2,9);
CREATE TABLE note_claims(note_id TEXT PRIMARY KEY REFERENCES notes(note_id), task_id TEXT NOT NULL UNIQUE REFERENCES download_tasks(id), acquired_at_ms INTEGER NOT NULL);
CREATE TABLE asset_claims(target_path_key TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES download_tasks(id), file_id TEXT NOT NULL UNIQUE REFERENCES download_files(id));
CREATE TABLE download_attempts(id INTEGER PRIMARY KEY, file_id TEXT NOT NULL REFERENCES download_files(id), attempt_no INTEGER NOT NULL,
 endpoint_index INTEGER NOT NULL, http_status INTEGER NOT NULL, error_message TEXT NOT NULL, started_at_ms INTEGER NOT NULL, finished_at_ms INTEGER NOT NULL,
 UNIQUE(file_id,attempt_no));
CREATE TABLE download_history(task_id TEXT PRIMARY KEY REFERENCES download_tasks(id), started_at_ms INTEGER NOT NULL);
CREATE TABLE download_history_files(file_id TEXT PRIMARY KEY REFERENCES download_files(id), task_id TEXT NOT NULL REFERENCES download_history(task_id),
 state INTEGER NOT NULL, result_json TEXT NOT NULL CHECK(json_valid(result_json)), updated_at_ms INTEGER NOT NULL);
CREATE TABLE download_finalize_journal(file_id TEXT PRIMARY KEY REFERENCES download_files(id), temporary_path TEXT NOT NULL,
 bytes INTEGER NOT NULL, sha256 TEXT NOT NULL, created_at_ms INTEGER NOT NULL);
CREATE INDEX downloads_queue ON download_tasks(state,created_at_ms,id);
CREATE INDEX downloads_recent ON download_tasks(created_at_ms DESC,id DESC);
CREATE INDEX downloads_note ON download_tasks(note_id,created_at_ms DESC,id DESC);
CREATE INDEX downloads_author ON download_tasks(author_user_id,created_at_ms DESC,id DESC);
CREATE INDEX downloads_asset ON download_files(asset_key,state,task_id);
CREATE INDEX download_history_recent ON download_history(started_at_ms DESC,task_id DESC);
