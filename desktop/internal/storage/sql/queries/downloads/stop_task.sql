UPDATE download_tasks
SET state=?,
    finished_at_ms=?,
    updated_at_ms=?,
    current_item_id='',
    current_bytes=0,
    current_total=NULL,
    revision=revision+1
WHERE id=?
  AND state IN (1,3,4,5,10);
