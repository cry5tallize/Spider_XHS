SELECT s.input_index,s.target_id,s.account_id,o.page_number FROM parse_item_sources AS o JOIN parse_sources AS s ON s.id=o.source_id WHERE o.item_id=? ORDER BY s.input_index,o.page_number;
