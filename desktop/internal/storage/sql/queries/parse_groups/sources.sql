SELECT id, group_id, input_index, target_id, account_id, credential_version, state,
 next_cursor, pages_completed, has_more, user_name, error_json, limit_reason, input_blob, secret_provider FROM parse_sources WHERE group_id=? ORDER BY input_index;
