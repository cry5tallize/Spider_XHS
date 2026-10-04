SELECT file_id, temporary_path, bytes, sha256
FROM download_finalize_journal
ORDER BY created_at_ms, file_id;
