INSERT INTO asset_claims(target_path_key, task_id, file_id) VALUES(?, ?, ?)
ON CONFLICT DO NOTHING;
