UPDATE accounts SET name = ?, enabled = ?, updated_at_ms = ?,
    is_default = CASE WHEN ? = 0 THEN 0 ELSE is_default END,
    status = CASE WHEN ? = 0 THEN 5 WHEN enabled = 0 THEN 1 ELSE status END
WHERE id = ? AND deleted_at_ms IS NULL;
