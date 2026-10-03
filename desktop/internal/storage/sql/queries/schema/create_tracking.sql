CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY CHECK (version > 0),
    filename TEXT NOT NULL,
    checksum TEXT NOT NULL,
    applied_at_ms INTEGER NOT NULL CHECK (applied_at_ms >= 0)
);
