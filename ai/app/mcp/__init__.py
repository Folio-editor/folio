"""MCP 툴 패키지.

초안 생성(②)·검수(③)에서 Anthropic tool_use 파라미터로 노출된다.
Phase 4 (Day 5)에 구현 시작.

원칙:
- writer_id / work_id는 서버 세션 컨텍스트(`WriterContext`)에서 강제 주입.
- LLM이 파라미터로 work_id를 넣어도 무시 (프롬프트 인젝션 방지).
- 모든 툴은 읽기 전용.
"""
