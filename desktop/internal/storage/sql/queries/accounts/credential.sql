SELECT secret_provider, secret_blob FROM accounts
WHERE id = ? AND deleted_at_ms IS NULL;
