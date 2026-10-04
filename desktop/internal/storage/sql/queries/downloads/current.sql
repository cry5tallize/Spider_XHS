UPDATE download_tasks
SET current_item_id=?,
    current_sequence=?,
    current_bytes=0,
    current_total=NULL,
    updated_at_ms=?,
    revision=revision+1
WHERE id=?
  AND state=3;
