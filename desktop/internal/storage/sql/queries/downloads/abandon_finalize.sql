UPDATE download_files
SET state=10,
    error_json=?,
    updated_at_ms=?
WHERE id=?
  AND state=9;
