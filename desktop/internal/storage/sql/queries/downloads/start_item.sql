UPDATE download_files
SET state=2,
    current_bytes=0,
    current_total=NULL,
    error_json=NULL,
    updated_at_ms=?
WHERE id=?
  AND state=1;
