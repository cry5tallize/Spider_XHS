SELECT s.id, s.note_id, COALESCE(s.account_id,''), COALESCE(s.credential_version,0),
s.parser_version, s.warnings_json, s.fetched_at_ms, s.raw_sha256, s.pretty_json
FROM notes AS n JOIN note_snapshots AS s ON s.id=n.current_snapshot_id WHERE n.note_id=?;
