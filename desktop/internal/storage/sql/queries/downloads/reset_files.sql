UPDATE download_files
SET state=1,
    error_json=NULL,
    completed_at_ms=NULL,
    current_bytes=0,
    current_total=NULL,
    updated_at_ms=?
WHERE task_id=?
  AND state IN (1,3,4,7,8,10);
