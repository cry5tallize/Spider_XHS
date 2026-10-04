UPDATE download_files
SET state=?,
    result_json=?,
    error_json=?,
    completed_at_ms=?,
    updated_at_ms=?,
    current_bytes=0,
    current_total=NULL
WHERE id=?
  AND state IN (2,9);
