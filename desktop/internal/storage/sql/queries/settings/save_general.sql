INSERT INTO app_settings (key, schema_version, value_json, revision, updated_at_ms)
SELECT 'general', ?, ?, ?, ?
WHERE ? = 0 OR EXISTS (
    SELECT 1 FROM app_settings WHERE key = 'general' AND revision = ?
)
ON CONFLICT (key) DO UPDATE SET
    schema_version = excluded.schema_version,
    value_json = excluded.value_json,
    revision = excluded.revision,
    updated_at_ms = excluded.updated_at_ms
WHERE app_settings.revision = ?;
