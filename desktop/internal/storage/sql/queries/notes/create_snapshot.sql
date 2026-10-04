INSERT INTO note_snapshots (id, note_id, parser_version, account_id, credential_version,
pretty_json, raw_json, raw_sha256, warnings_json, fetched_at_ms)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
