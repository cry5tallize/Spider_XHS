INSERT INTO notes (note_id, author_user_id, kind, raw_kind, title, description, has_live_photo,
image_count, video_stream_count, motion_stream_count, cover_url, published_at_ms, modified_at_ms,
fetched_at_ms, current_snapshot_id, created_at_ms, updated_at_ms)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(note_id) DO UPDATE SET author_user_id=excluded.author_user_id, kind=excluded.kind,
raw_kind=excluded.raw_kind, title=excluded.title, description=excluded.description,
has_live_photo=excluded.has_live_photo, image_count=excluded.image_count,
video_stream_count=excluded.video_stream_count, motion_stream_count=excluded.motion_stream_count,
cover_url=excluded.cover_url, published_at_ms=excluded.published_at_ms, modified_at_ms=excluded.modified_at_ms,
fetched_at_ms=excluded.fetched_at_ms, current_snapshot_id=excluded.current_snapshot_id, updated_at_ms=excluded.updated_at_ms;
