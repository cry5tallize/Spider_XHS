UPDATE download_files
SET attempts=MAX(attempts, ?)
WHERE id=?;
