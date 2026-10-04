SELECT g.id, g.mode, g.state, g.config_json,
 (SELECT COUNT(*) FROM parse_sources WHERE group_id=g.id),
 (SELECT COUNT(*) FROM parse_items WHERE group_id=g.id),
 (SELECT COUNT(*) FROM parse_items WHERE group_id=g.id AND state IN (3,6)),
 (SELECT COUNT(*) FROM parse_items WHERE group_id=g.id AND state=4),
 (SELECT COUNT(*) FROM parse_items WHERE group_id=g.id AND state=5),
 (SELECT COUNT(*) FROM parse_items WHERE group_id=g.id AND state=2),
 g.error_json, g.limit_reason, g.created_at_ms, g.updated_at_ms, g.revision, g.run_version,g.fingerprint FROM parse_groups AS g WHERE g.request_id=?;
