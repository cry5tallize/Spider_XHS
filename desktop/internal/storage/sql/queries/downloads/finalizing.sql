UPDATE download_files
SET state=9,
    updated_at_ms=?
WHERE id=?
  AND state=2;
