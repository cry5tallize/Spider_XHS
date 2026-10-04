UPDATE parse_jobs SET state=3, snapshot_id=?, error_json=NULL, finished_at_ms=?, updated_at_ms=?, revision=revision+1
WHERE id=? AND state=2;
