UPDATE download_tasks
SET successful_items=(SELECT COUNT(*)
FROM download_files
WHERE task_id=?
  AND state=5),
    skipped_items=(SELECT COUNT(*)
FROM download_files
WHERE task_id=?
  AND state=6),
    failed_items=(SELECT COUNT(*)
FROM download_files
WHERE task_id=?
  AND state=7),
    fulfilled_items=(SELECT COUNT(*)
FROM download_files
WHERE task_id=?
  AND (state=5 OR (state=6
  AND json_extract(result_json,'$.skip_reason')=1))),
    completed_bytes=COALESCE((SELECT SUM(json_extract(result_json,'$.bytes'))
FROM download_files
WHERE task_id=?
  AND (state=5 OR (state=6
  AND json_extract(result_json,'$.skip_reason')=1))),0),
    transferred_bytes=(SELECT COALESCE(SUM(transferred_bytes),0)
FROM download_files
WHERE task_id=?),
    current_item_id='',
    current_bytes=0,
    current_total=NULL,
    updated_at_ms=?,
    revision=revision+1
WHERE id=?;
