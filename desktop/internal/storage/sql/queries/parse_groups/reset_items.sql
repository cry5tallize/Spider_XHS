UPDATE parse_items SET state=1,error_json=NULL,skip_reason='' WHERE group_id=? AND state IN (2,7);
