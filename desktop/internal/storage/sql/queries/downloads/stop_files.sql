UPDATE download_files
SET state=?,
    current_bytes=0,
    current_total=NULL,
    updated_at_ms=?
WHERE task_id=?
  AND state IN (1,2,3,4,10);
