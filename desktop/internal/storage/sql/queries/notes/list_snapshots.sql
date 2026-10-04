SELECT id, note_id, COALESCE(account_id,''), COALESCE(credential_version,0), parser_version,
warnings_json, fetched_at_ms, raw_sha256 FROM note_snapshots
WHERE note_id=? ORDER BY fetched_at_ms DESC, id DESC LIMIT 200;
