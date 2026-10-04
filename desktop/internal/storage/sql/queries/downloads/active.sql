SELECT t.id, t.note_id, t.snapshot_id, t.title, COALESCE(t.author_user_id,''), t.author_name, COALESCE(t.account_id,''), t.state, t.config_json, t.relative_directory, t.plan_hash, t.planned_items, t.successful_items, t.skipped_items, t.failed_items, t.fulfilled_items, t.completed_bytes, t.transferred_bytes, t.current_item_id, t.current_sequence, t.current_bytes, t.current_total, t.error_json, t.created_at_ms, t.started_at_ms, t.finished_at_ms, t.updated_at_ms, t.revision, COALESCE(t.batch_id,''), t.live_pairs_json
FROM download_tasks AS t
WHERE t.state IN (1,3,5)
ORDER BY t.created_at_ms, t.id
LIMIT 1100;
