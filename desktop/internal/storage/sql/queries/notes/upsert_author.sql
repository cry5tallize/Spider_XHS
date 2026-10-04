INSERT INTO authors (user_id, nickname, avatar_url, profile_json, fetched_at_ms, created_at_ms, updated_at_ms)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(user_id) DO UPDATE SET nickname=excluded.nickname, avatar_url=excluded.avatar_url,
profile_json=excluded.profile_json, fetched_at_ms=excluded.fetched_at_ms, updated_at_ms=excluded.updated_at_ms;
