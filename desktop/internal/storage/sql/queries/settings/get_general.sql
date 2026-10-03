SELECT schema_version, value_json, revision, updated_at_ms
FROM app_settings
WHERE key = 'general';
