UPDATE parse_groups SET state=8,revision=revision+1,updated_at_ms=? WHERE state IN (1,2);
