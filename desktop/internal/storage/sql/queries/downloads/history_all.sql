INSERT INTO download_history_files(file_id, task_id, state, result_json, updated_at_ms) SELECT f.id, f.task_id, f.state, f.result_json, f.updated_at_ms
FROM download_files AS f
JOIN download_history AS h ON h.task_id=f.task_id
WHERE f.task_id=? ON CONFLICT(file_id) DO UPDATE
SET state=excluded.state,
    result_json=excluded.result_json,
    updated_at_ms=excluded.updated_at_ms;
