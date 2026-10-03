UPDATE accounts SET is_default = 1, updated_at_ms = ?
WHERE id = ? AND enabled = 1 AND deleted_at_ms IS NULL;
