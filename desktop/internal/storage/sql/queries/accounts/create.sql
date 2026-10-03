INSERT INTO accounts (id, name, status, enabled, is_default, secret_blob,
                      secret_provider, credential_version, created_at_ms, updated_at_ms)
VALUES (?, ?, 1, 1,
        CASE WHEN NOT EXISTS (SELECT 1 FROM accounts WHERE is_default=1 AND deleted_at_ms IS NULL) THEN 1 ELSE 0 END,
        ?, ?, 1, ?, ?);
