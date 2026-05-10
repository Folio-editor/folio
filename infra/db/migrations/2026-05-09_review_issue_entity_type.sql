-- Migration: extraction_suggestion 에 'review_issue' entity_type 추가 (2026-05-09)
--
-- 배경: agent 채팅에서 회차 검수 시 발견한 이슈를 1건당 1행 propose_review_issue 도구로 적재.
-- payload: {episode_id, lines:[1,2,...], severity:'critical|warning|info', type, description, suggestion}
-- 프론트는 이 entity_type 의 카드를 채팅 응답 footer 에 렌더하면서
-- "본문에서 보기" 버튼 → useReviewHighlightStore 세팅 + 메인 탭 episode 오픈.
--
-- 본 entity_type 은 SuggestionApplier 에서 자동 적용되지 않는다 (검수는 단순 표지자).
-- 작가가 직접 본문 수정한 뒤 status='confirmed' 로 닫거나 'rejected' 로 무시.

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
        'review_issue'
    ));

COMMIT;
