SELECT i.id, i.group_id, i.note_id, i.title, i.raw_kind, i.account_id, i.credential_version,
 i.state, COALESCE(i.snapshot_id,''), i.error_json, i.skip_reason,
 (SELECT COUNT(*) FROM parse_item_sources WHERE item_id=i.id), i.ordinal,
 i.published_at_ms, i.ref_blob, i.secret_provider FROM parse_items AS i WHERE i.group_id=? AND i.ordinal>? AND (?=0 OR i.state=?) ORDER BY i.ordinal LIMIT ?;
