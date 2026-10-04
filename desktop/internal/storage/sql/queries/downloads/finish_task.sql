UPDATE download_tasks
SET state=?,
    error_json=?,
    finished_at_ms=?,
    updated_at_ms=?,
    revision=revision+1
WHERE id=?
  AND state=3;
