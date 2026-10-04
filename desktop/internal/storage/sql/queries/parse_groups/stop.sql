UPDATE parse_groups SET state=?,error_json=?,revision=revision+1,updated_at_ms=? WHERE id=? AND state IN (1,2,6,8);
