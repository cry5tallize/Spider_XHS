INSERT INTO download_presets(id,name,schema_version,config_json,updated_at_ms) VALUES(?,?,1,?,?)
ON CONFLICT(id) DO UPDATE SET name=excluded.name,config_json=excluded.config_json,updated_at_ms=excluded.updated_at_ms;
