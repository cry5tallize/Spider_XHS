UPDATE parse_jobs SET state=?, error_json=?, finished_at_ms=?, updated_at_ms=?, revision=revision+1
WHERE id=? AND state IN (1,2);
