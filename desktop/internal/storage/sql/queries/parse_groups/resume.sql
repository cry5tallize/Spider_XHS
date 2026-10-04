UPDATE parse_groups SET state=1,error_json=NULL,limit_reason='',revision=revision+1,updated_at_ms=? WHERE id=? AND state IN (4,5,6,8,9);
