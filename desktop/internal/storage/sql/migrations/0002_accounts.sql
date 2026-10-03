CREATE TABLE accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    xhs_user_id TEXT NOT NULL DEFAULT '',
    nickname TEXT NOT NULL DEFAULT '',
    status INTEGER NOT NULL CHECK (status IN (0,1,2,3,4,5,6)),
    enabled INTEGER NOT NULL CHECK (enabled IN (0,1)),
    is_default INTEGER NOT NULL CHECK (is_default IN (0,1)),
    secret_blob BLOB,
    secret_provider INTEGER NOT NULL CHECK (secret_provider IN (0,1)),
    secret_version INTEGER NOT NULL DEFAULT 1 CHECK (secret_version = 1),
    credential_version INTEGER NOT NULL CHECK (credential_version > 0),
    validated_at_ms INTEGER,
    last_error TEXT NOT NULL DEFAULT '',
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    deleted_at_ms INTEGER
);
CREATE UNIQUE INDEX accounts_one_default ON accounts (is_default)
WHERE is_default = 1 AND deleted_at_ms IS NULL;
