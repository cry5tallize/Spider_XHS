CREATE TABLE authors (
    user_id TEXT PRIMARY KEY,
    nickname TEXT NOT NULL,
    avatar_url TEXT NOT NULL,
    profile_json TEXT NOT NULL CHECK (json_valid(profile_json)),
    fetched_at_ms INTEGER NOT NULL,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL
);
CREATE TABLE notes (
    note_id TEXT PRIMARY KEY,
    author_user_id TEXT REFERENCES authors(user_id),
    kind INTEGER NOT NULL CHECK (kind IN (0,1,2)),
    raw_kind TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    has_live_photo INTEGER NOT NULL CHECK (has_live_photo IN (0,1)),
    image_count INTEGER NOT NULL CHECK (image_count >= 0),
    video_stream_count INTEGER NOT NULL CHECK (video_stream_count >= 0),
    motion_stream_count INTEGER NOT NULL CHECK (motion_stream_count >= 0),
    cover_url TEXT NOT NULL,
    published_at_ms INTEGER,
    modified_at_ms INTEGER,
    fetched_at_ms INTEGER NOT NULL,
    current_snapshot_id TEXT REFERENCES note_snapshots(id) DEFERRABLE INITIALLY DEFERRED,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL
);
CREATE TABLE note_snapshots (
    id TEXT PRIMARY KEY,
    note_id TEXT NOT NULL REFERENCES notes(note_id),
    parser_version INTEGER NOT NULL CHECK (parser_version > 0),
    account_id TEXT REFERENCES accounts(id),
    credential_version INTEGER,
    pretty_json TEXT NOT NULL CHECK (json_valid(pretty_json)),
    raw_json TEXT NOT NULL CHECK (json_valid(raw_json)),
    raw_sha256 TEXT NOT NULL,
    warnings_json TEXT NOT NULL CHECK (json_valid(warnings_json)),
    fetched_at_ms INTEGER NOT NULL
);
CREATE TABLE parse_jobs (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL UNIQUE,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    note_id TEXT NOT NULL,
    snapshot_id TEXT REFERENCES note_snapshots(id),
    state INTEGER NOT NULL CHECK (state IN (0,1,2,3,4,5,6)),
    error_json TEXT CHECK (error_json IS NULL OR json_valid(error_json)),
    created_at_ms INTEGER NOT NULL,
    started_at_ms INTEGER,
    finished_at_ms INTEGER,
    updated_at_ms INTEGER NOT NULL,
    revision INTEGER NOT NULL CHECK (revision > 0)
);
CREATE INDEX notes_recent ON notes(fetched_at_ms DESC, note_id DESC);
CREATE INDEX notes_author ON notes(author_user_id, fetched_at_ms DESC, note_id DESC);
CREATE INDEX snapshots_note ON note_snapshots(note_id, fetched_at_ms DESC, id DESC);
CREATE INDEX parse_jobs_recent ON parse_jobs(created_at_ms DESC, id DESC);
