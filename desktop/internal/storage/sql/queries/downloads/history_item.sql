INSERT INTO download_history_files(file_id, task_id, state, result_json, updated_at_ms) SELECT id, task_id, state, result_json, updated_at_ms
FROM download_files
WHERE id=? ON CONFLICT(file_id) DO UPDATE
SET state=excluded.state,
    result_json=excluded.result_json,
    updated_at_ms=excluded.updated_at_ms;
