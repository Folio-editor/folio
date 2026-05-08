-- ============================================================
-- Migration: episode.word_count = 0 인데 본문 있는 stale 행 backfill
-- Date: 2026-05-08
-- Owner: agent UX 개선 (시드/템플릿이 word_count 0 으로 INSERT 한 회귀)
-- ============================================================
--
-- 배경:
--   useLocalWrite.createEpisode 가 INSERT 시 word_count 를 항상 0 으로 박았고,
--   사용자가 ContentEditor 로 입력하지 않은 시드/템플릿 회차들은 본문 (TipTap JSON
--   ciphertext) 가 채워져 있어도 word_count 가 0 으로 남음. AI agent (Sonnet) 가
--   list_episodes 결과의 word_count=0 만 보고 "본문 비어있음" 으로 단정 후 본문
--   조회를 스킵하는 회귀 발생.
--
--   ciphertext 라 SQL 로 평문 글자수 정확 계산 불가 → placeholder 1 로 설정해
--   "본문 존재" 신호만 명시. 사용자가 episode 한 번 열면 ContentEditor mount 시
--   onCharCountChange 가 호출되어 정확한 값으로 자동 보정 (PR 본문 effect 추가).
--
-- 영향: AI agent 가 word_count>0 회차로 인식 → 본문 조회 (summarize_episode 등)
-- 까지 도달 가능. 정확한 글자 수 필요 시 사용자 에디터 열기 1회로 자동 보정.
-- ============================================================

UPDATE episode
SET word_count = 1, updated_at = now()
WHERE word_count = 0
  AND content IS NOT NULL
  AND content <> ''
  -- v1: prefix(3) + Base64(IV12 + cipher + tag16) → 빈 문자열 암호화도 ~30자 이상.
  -- 30자 초과면 사실상 본문이 있다고 안전하게 판단 가능.
  AND length(content) > 30;
