SELECT n.note_id, COALESCE(n.author_user_id,''), COALESCE(a.nickname,''), n.kind, n.raw_kind,
n.title, n.description, n.has_live_photo, n.image_count, n.video_stream_count, n.motion_stream_count,
n.cover_url, n.published_at_ms, n.modified_at_ms, n.fetched_at_ms, n.current_snapshot_id
FROM notes AS n LEFT JOIN authors AS a ON a.user_id=n.author_user_id
WHERE (? = 0 OR (n.fetched_at_ms,n.note_id) < (?,?))
ORDER BY n.fetched_at_ms DESC, n.note_id DESC LIMIT ?;
