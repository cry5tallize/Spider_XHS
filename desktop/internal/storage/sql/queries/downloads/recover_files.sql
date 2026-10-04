UPDATE download_files
SET state=10,
    current_bytes=0,
    current_total=NULL,
    updated_at_ms=?
WHERE state IN (1,2,4);
