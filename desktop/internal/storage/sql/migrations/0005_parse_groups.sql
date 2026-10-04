CREATE TABLE parse_groups (
    id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, fingerprint TEXT NOT NULL,
    mode INTEGER NOT NULL CHECK(mode IN (1,2)), state INTEGER NOT NULL CHECK(state BETWEEN 0 AND 9),
    config_json TEXT NOT NULL CHECK(json_valid(config_json)), error_json TEXT,
    limit_reason TEXT NOT NULL DEFAULT '', created_at_ms INTEGER NOT NULL, updated_at_ms INTEGER NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1, run_version INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE parse_sources (
    id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES parse_groups(id), input_index INTEGER NOT NULL,
    target_id TEXT NOT NULL DEFAULT '', account_id TEXT NOT NULL REFERENCES accounts(id), credential_version INTEGER NOT NULL,
    input_blob BLOB NOT NULL, secret_provider INTEGER NOT NULL CHECK(secret_provider IN (0,1)),
    state INTEGER NOT NULL CHECK(state BETWEEN 0 AND 5), next_cursor TEXT NOT NULL DEFAULT '',
    pages_completed INTEGER NOT NULL DEFAULT 0, has_more INTEGER NOT NULL DEFAULT 1, user_name TEXT NOT NULL DEFAULT '',
    error_json TEXT, limit_reason TEXT NOT NULL DEFAULT '', UNIQUE(group_id,input_index)
);
CREATE TABLE parse_items (
    id TEXT PRIMARY KEY, ordinal INTEGER NOT NULL UNIQUE, group_id TEXT NOT NULL REFERENCES parse_groups(id),
    note_id TEXT NOT NULL, title TEXT NOT NULL, raw_kind TEXT NOT NULL, published_at_ms INTEGER,
    account_id TEXT NOT NULL REFERENCES accounts(id), credential_version INTEGER NOT NULL,
    ref_blob BLOB NOT NULL, secret_provider INTEGER NOT NULL CHECK(secret_provider IN (0,1)),
    ref_priority INTEGER NOT NULL DEFAULT 0,
    state INTEGER NOT NULL CHECK(state BETWEEN 0 AND 8), snapshot_id TEXT REFERENCES note_snapshots(id),
    error_json TEXT, skip_reason TEXT NOT NULL DEFAULT '', UNIQUE(group_id,note_id)
);
CREATE TABLE parse_item_sources (
    item_id TEXT NOT NULL REFERENCES parse_items(id), source_id TEXT NOT NULL REFERENCES parse_sources(id),
    ref_blob BLOB NOT NULL, page_number INTEGER NOT NULL, PRIMARY KEY(item_id,source_id,page_number)
);
CREATE INDEX parse_groups_queue ON parse_groups(state,created_at_ms,id);
CREATE INDEX parse_groups_recent ON parse_groups(created_at_ms DESC,id DESC);
CREATE INDEX parse_sources_group ON parse_sources(group_id,input_index);
CREATE INDEX parse_items_pending ON parse_items(group_id,state,ordinal);
CREATE TABLE parse_source_cursors(source_id TEXT NOT NULL REFERENCES parse_sources(id),cursor TEXT NOT NULL,PRIMARY KEY(source_id,cursor));
