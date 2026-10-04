SELECT f.id, f.result_json
FROM download_files AS f
JOIN download_tasks AS t ON t.id=f.task_id
WHERE f.asset_key=?
  AND t.note_id=?
  AND t.output_root_key=?
  AND (f.state=5 OR (f.state=6
  AND json_extract(f.result_json,'$.skip_reason')=1))
ORDER BY f.completed_at_ms DESC, f.id DESC
LIMIT 10;
