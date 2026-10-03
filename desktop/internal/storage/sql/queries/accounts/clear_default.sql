UPDATE accounts SET is_default = 0, updated_at_ms = ?
WHERE is_default = 1 AND deleted_at_ms IS NULL;
