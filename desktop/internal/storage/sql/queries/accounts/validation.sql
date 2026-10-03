UPDATE accounts SET status = ?, xhs_user_id = ?, nickname = ?, last_error = ?,
    validated_at_ms = ?, updated_at_ms = ?
WHERE id = ? AND credential_version = ? AND enabled = 1 AND deleted_at_ms IS NULL;
