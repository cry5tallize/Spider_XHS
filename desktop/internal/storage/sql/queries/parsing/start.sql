UPDATE parse_jobs SET state=2, started_at_ms=?, updated_at_ms=?, revision=revision+1 WHERE id=? AND state=1;
