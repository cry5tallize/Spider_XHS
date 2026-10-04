UPDATE download_tasks
SET state=10,
    finished_at_ms=?,
    updated_at_ms=?,
    current_item_id='',
    current_bytes=0,
    current_total=NULL,
    revision=revision+1
WHERE state IN (1,2,3,5);
