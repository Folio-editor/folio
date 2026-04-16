"""Phase 3 (Day 4) 예정.

generate_summary의 raw_result에서 인물/용어/복선 후보를 꺼내
`extraction_suggestion` UPSERT (status='pending').
UNIQUE(work_id, entity_type, suggested_name)로 중복 차단.
"""
