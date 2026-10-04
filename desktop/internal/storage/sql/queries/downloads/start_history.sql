INSERT INTO download_history(task_id, started_at_ms) VALUES(?, ?) ON CONFLICT(task_id) DO NOTHING;
