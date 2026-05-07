"""Agent service (Phase 4).

- scenarios.py : 6 시나리오 system prompt + 도구 화이트리스트 + 예산
- budget.py    : Tier 1/2/3 토큰 캡 트래커 + 영수증 line 버퍼
- session.py   : agent_session CRUD + 자동 압축
- meta_block.py: 작품 메타 캐시 블록 (Block B for prompt caching)
- planner.py   : Sonnet messages.create tool loop with cache_control
- runner.py    : run_agent — 진입점
"""
