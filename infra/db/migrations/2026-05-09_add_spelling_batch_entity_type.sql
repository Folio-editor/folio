-- Migration: extraction_suggestion.entity_type 에 'spelling_batch' 추가 (Phase 5)
--
-- 사연:
--   propose_spelling_fix 1건당 1행 흐름은 작가에게 30건 카드를 일일이 검토시킴 → UX 부담.
--   체크리스트 1행으로 묶어 작가가 한 번에 OK / NG 토글 후 [√ 적용] 으로 일괄 치환.
--
-- spelling_batch payload:
--   {episode_id, expected_updated_at, fixes: [{line, original, suggestion, fix_type, reason?}]}
--   승인 시 frontend 가 selected_indices: [0,2,5] 를 PATCH 함께 전송.
--   backend SuggestionApplier.applySpellingBatch 가 선택된 fix 만 적용.
--
-- spelling_fix (단건) 도 보존 — 1건짜리 즉시 적용 케이스 / 데이터 호환.

BEGIN;

ALTER TABLE extraction_suggestion DROP CONSTRAINT IF EXISTS extraction_suggestion_entity_type_check;
ALTER TABLE extraction_suggestion
    ADD CONSTRAINT extraction_suggestion_entity_type_check
    CHECK (entity_type IN (
        'character','world_note','term',
        'character_update','character_delete',
        'world_note_update','world_note_delete',
        'plot_create','plot_tree','plot_revision','plot_delete',
        'episode_draft','episode_update','episode_delete',
        'review_issue',
        'spelling_fix',
        'spelling_batch'
    ));

COMMIT;
