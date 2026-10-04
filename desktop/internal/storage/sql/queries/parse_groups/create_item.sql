INSERT INTO parse_items(id,ordinal,group_id,note_id,title,raw_kind,published_at_ms,account_id,credential_version,ref_blob,secret_provider,state,ref_priority)
 SELECT ?, COALESCE(MAX(ordinal),0)+1, ?,?,?,?,?,?,?,?, ?,1,? FROM parse_items WHERE 1=1
 ON CONFLICT(group_id,note_id) DO NOTHING;
