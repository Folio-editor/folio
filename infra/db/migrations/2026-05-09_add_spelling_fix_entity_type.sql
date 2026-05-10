-- Migration: extraction_suggestion.entity_type 에 'spelling_fix' 추가 (Phase 5)
--
-- 사연:
--   propose_spelling_fix MCP 도구를 추가했는데 INSERT 가 PG CHECK 제약 위반으로 거부됐다.
--   agent 입장에선 "기술적 문제" 로만 보여 propose_review_issue 로 fallback —
--   결국 자동 치환 기능이 동작 안 함. CHECK 에 'spelling_fix' 추가로 활성화.
--
-- spelling_fix 의 의미:
--   - 한국어 표기 오류 1건 (typo / spacing / punctuation)
--   - payload: {episode_id, line, original, suggestion, fix_type, reason?, expected_updated_at?}
--   - 승인 시 backend SuggestionApplier 가 1:1 자동 치환 후 episode 재저장.
--   - propose_review_issue 와 분리 — review_issue 는 advisory (작가 직접 수정), spelling_fix 는 자동 적용.
--
-- 정합:
--   - frontend suggestionPreview.tsx 의 SpellingFixCard, SuggestionInbox 의 isSpellingFix 분기와 일치.
--   - backend SuggestionApplier.applySpellingFix 와 일치.
--   - ai/app/mcp/tools/proposals.py 의 propose_spelling_fix 와 일치.

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
        'spelling_fix'
    ));

COMMIT;
