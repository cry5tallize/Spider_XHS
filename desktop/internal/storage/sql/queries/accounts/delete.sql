UPDATE accounts SET deleted_at_ms = ?, updated_at_ms = ?, enabled = 0,
    is_default = 0, status = 5, secret_blob = NULL
WHERE id = ? AND deleted_at_ms IS NULL;
