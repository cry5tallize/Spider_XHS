UPDATE parse_sources SET state=1,error_json=NULL,limit_reason='' WHERE group_id=? AND state IN (4,5);
