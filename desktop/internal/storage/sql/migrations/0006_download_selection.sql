CREATE TABLE download_batches (
    id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, fingerprint TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL
);
ALTER TABLE download_tasks ADD COLUMN batch_id TEXT REFERENCES download_batches(id);
ALTER TABLE download_tasks ADD COLUMN live_pairs_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(live_pairs_json));
CREATE INDEX download_tasks_batch ON download_tasks(batch_id,created_at_ms,id);
CREATE TABLE download_presets (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, schema_version INTEGER NOT NULL,
    config_json TEXT NOT NULL CHECK(json_valid(config_json)), updated_at_ms INTEGER NOT NULL
);
