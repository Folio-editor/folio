-- ============================================================
-- Migration: episode.status 의 '미작성' → '예정' 변경
-- Date: 2026-05-08
-- Owner: agent UX 개선 (Phase 4.6 후속)
-- ============================================================
--
-- 배경:
--   episode.status 기본값이 '미작성' 으로 설정되어 있어, AI agent (Sonnet) 가
--   list_episodes 결과의 status='미작성' 만 보고 본문이 비어있다고 단정 후
--   본문 조회를 스킵해버리는 케이스 발생. 실제론 status 값과 본문 작성 여부는
--   직교적 (status='미작성' 이어도 본문은 일부 작성됐을 수 있음).
--
--   사용자 결정: '미작성' → '예정' 으로 단어를 변경해 의미적 함의를 줄임 → agent
--   가 본문 word_count 를 직접 보고 판단하도록 유도.
--
-- 변경:
--   episode.status = '미작성' 인 모든 행을 '예정' 으로 UPDATE.
--   status 컬럼은 VARCHAR(20) 평문 + CHECK 제약 없음 → 자유 텍스트, 안전.
--
-- 영향:
--   - SyncService 자동 default '미작성' → 코드에서 '예정' 으로 변경 (병행)
--   - useLocalWrite createEpisode / restoreEpisode 도 '예정' 으로 변경
--   - SyncService.triggerEpisodeSummaryAfterCommit 의 status='완성' 트리거는 무관
--   - 기존 '초고' / '퇴고' / '완성' 값은 그대로 보존
-- ============================================================

UPDATE episode
SET status = '예정', updated_at = now()
WHERE status = '미작성';
