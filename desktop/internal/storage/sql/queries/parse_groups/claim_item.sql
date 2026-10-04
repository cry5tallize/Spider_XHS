UPDATE parse_items SET state=2,error_json=NULL,skip_reason='' WHERE id=? AND state=1;
