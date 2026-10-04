UPDATE download_tasks
SET state=1,
    finished_at_ms=NULL,
    error_json=NULL,
    updated_at_ms=?,
    revision=revision+1
WHERE id=?
  AND state IN (4,7,8,10);
