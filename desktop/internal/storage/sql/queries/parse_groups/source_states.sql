SELECT state,COUNT(*) FROM parse_sources WHERE group_id=? GROUP BY state;
