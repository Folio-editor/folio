-- agent_session.scenario CHECK 에 'card_auto' 추가.
-- card_auto = 카드 모드 자유 문서 생성 진입점 (auto 와 동등 동작, 채팅 thread 목록 분리용 alias).
-- 재실행 안전 — 기존 constraint 있으면 drop 후 재생성.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_session_scenario_check') THEN
        ALTER TABLE agent_session DROP CONSTRAINT agent_session_scenario_check;
    END IF;
END $$;

ALTER TABLE agent_session
    ADD CONSTRAINT agent_session_scenario_check
    CHECK (scenario IN (
        'auto', 'card_auto',
        'draft_next','consistency_check','revision',
        'extraction','qa','ideation'
    ));
