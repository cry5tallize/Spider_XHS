UPDATE download_tasks
SET state=3,
    started_at_ms=COALESCE(started_at_ms, ?),
    finished_at_ms=NULL,
    updated_at_ms=?,
    error_json=NULL,
    revision=revision+1
WHERE id=?
  AND state=1;
