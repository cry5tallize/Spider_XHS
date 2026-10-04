SELECT s.id, s.note_id, COALESCE(s.account_id,''), COALESCE(s.credential_version,0),
 s.parser_version,s.warnings_json,s.fetched_at_ms,s.raw_sha256,s.pretty_json
 FROM note_snapshots AS s WHERE s.note_id=? AND s.account_id=? AND s.credential_version=? AND s.fetched_at_ms>=?
 ORDER BY s.fetched_at_ms DESC,s.id DESC LIMIT 1;
