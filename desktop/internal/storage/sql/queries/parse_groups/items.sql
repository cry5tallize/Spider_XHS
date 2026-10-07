SELECT i.id, i.group_id, i.note_id, i.title, i.raw_kind, i.account_id, i.credential_version,
 i.state, COALESCE(i.snapshot_id,''), i.error_json, i.skip_reason,
 (SELECT COUNT(*) FROM parse_item_sources WHERE item_id=i.id), i.ordinal,
 i.published_at_ms, i.ref_blob, i.secret_provider,
 COALESCE(json_extract(s.pretty_json, '$.user.id'), ''),
 COALESCE(json_extract(s.pretty_json, '$.user.nickname'), ''),
 COALESCE(json_extract(s.pretty_json, '$.user.avatar_url'), ''),
 COALESCE(json_extract(s.pretty_json, '$.images[0].variants[0].url'), ''),
 COALESCE(json_array_length(s.pretty_json, '$.images'), 0),
 COALESCE(json_array_length(s.pretty_json, '$.video.streams'), 0),
 COALESCE(json_extract(s.pretty_json, '$.has_live_photo'), 0),
 (SELECT COUNT(*) FROM json_each(s.pretty_json, '$.images')
  WHERE json_extract(value, '$.live_photo')=1 OR COALESCE(json_array_length(value, '$.motion_streams'),0)>0)
 FROM parse_items AS i LEFT JOIN note_snapshots AS s ON s.id=i.snapshot_id
 WHERE i.group_id=? AND i.ordinal>? AND (?=0 OR i.state=?) ORDER BY i.ordinal LIMIT ?;
