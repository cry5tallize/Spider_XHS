UPDATE parse_jobs SET state=6, finished_at_ms=?, updated_at_ms=?, revision=revision+1 WHERE state IN (1,2);
