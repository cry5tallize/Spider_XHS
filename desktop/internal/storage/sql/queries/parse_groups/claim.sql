UPDATE parse_groups SET state=2,run_version=run_version+1,revision=revision+1,updated_at_ms=? WHERE id=? AND state=1;
