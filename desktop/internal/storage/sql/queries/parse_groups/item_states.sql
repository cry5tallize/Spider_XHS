SELECT state,COUNT(*) FROM parse_items WHERE group_id=? GROUP BY state;
