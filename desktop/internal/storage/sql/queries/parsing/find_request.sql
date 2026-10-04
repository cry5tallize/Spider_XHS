SELECT id, request_id, account_id, note_id, COALESCE(snapshot_id,''), state, error_json,
created_at_ms, started_at_ms, finished_at_ms, updated_at_ms, revision FROM parse_jobs WHERE request_id=?;
