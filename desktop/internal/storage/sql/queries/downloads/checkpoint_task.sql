UPDATE download_tasks
SET transferred_bytes=?,
    current_bytes=?,
    current_total=?,
    updated_at_ms=?
WHERE id=?
  AND state=3;
