-- Migration: extraction_suggestion CHECK constraint 확장 (Phase 4.5)
-- 신규 entity_type:
--   - character_delete    : 인물 삭제 (CASCADE)
--   - world_note_update   : 세계관 노트 수정 (이름/내용)
--   - world_note_delete   : 세계관 노트 삭제
--   - episode_update      : 회차 직접 수정 (제목/본문/status)
--   - episode_delete      : 회차 삭제

BEGIN;

ALTER TABLE extraction_suggestion DROP CONSTRAINT IF EXISTS extraction_suggestion_entity_type_check;
ALTER TABLE extraction_suggestion
    ADD CONSTRAINT extraction_suggestion_entity_type_check
    CHECK (entity_type IN (
        'character','world_note','term',
        'character_update','character_delete',
        'world_note_update','world_note_delete',
        'plot_revision',
        'episode_draft','episode_update','episode_delete'
    ));

COMMIT;
