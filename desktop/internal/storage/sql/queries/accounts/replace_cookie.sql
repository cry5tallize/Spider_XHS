UPDATE accounts SET secret_blob = ?, secret_provider = ?, credential_version = credential_version + 1,
    status = CASE WHEN enabled = 1 THEN 1 ELSE 5 END,
    validated_at_ms = NULL, last_error = '', xhs_user_id = '', nickname = '', avatar_url = '', updated_at_ms = ?
WHERE id = ? AND credential_version = ? AND deleted_at_ms IS NULL;
