UPDATE accounts SET status = ?1,
    xhs_user_id = CASE WHEN ?1 = 2 THEN ?2 ELSE xhs_user_id END,
    nickname = CASE WHEN ?1 = 2 THEN ?3 ELSE nickname END,
    avatar_url = CASE WHEN ?1 = 2 THEN ?4 ELSE avatar_url END,
    last_error = ?5, validated_at_ms = ?6, updated_at_ms = ?6
WHERE id = ?7 AND credential_version = ?8 AND enabled = 1 AND deleted_at_ms IS NULL;
