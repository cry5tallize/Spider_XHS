SELECT id, note_id, COALESCE(account_id,''), COALESCE(credential_version,0), parser_version,
warnings_json, fetched_at_ms, raw_sha256, pretty_json FROM note_snapshots WHERE id=?;
