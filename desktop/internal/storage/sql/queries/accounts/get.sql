SELECT id, name, xhs_user_id, nickname, avatar_url, status, enabled, is_default,
       length(secret_blob) > 0, credential_version, validated_at_ms,
       last_error, created_at_ms, updated_at_ms
FROM accounts WHERE id = ? AND deleted_at_ms IS NULL;
