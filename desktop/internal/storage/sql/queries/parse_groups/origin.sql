INSERT INTO parse_item_sources(item_id,source_id,ref_blob,page_number)
 SELECT id,?,?,? FROM parse_items WHERE group_id=? AND note_id=?
 ON CONFLICT(item_id,source_id,page_number) DO NOTHING;
