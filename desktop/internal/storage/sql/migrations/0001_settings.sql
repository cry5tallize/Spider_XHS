CREATE TABLE app_settings (
    key TEXT PRIMARY KEY,
    schema_version INTEGER NOT NULL CHECK (schema_version > 0),
    value_json TEXT NOT NULL CHECK (json_valid(value_json)),
    revision INTEGER NOT NULL CHECK (revision > 0),
    updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0)
);
