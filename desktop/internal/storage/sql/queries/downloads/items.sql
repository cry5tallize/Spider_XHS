SELECT id, task_id, plan_json, inline_blob, state, transferred_bytes, current_bytes, current_total, result_json, error_json, attempts
FROM download_files
WHERE task_id=?
ORDER BY item_sequence;
