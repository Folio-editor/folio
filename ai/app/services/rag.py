"""Phase 4 예정: RAG 사전 조립기.

입력: WriterContext + 이번 요청 메타(storyline/이번 회차 원고 등)
출력: tool_use 루프에 들어가기 전의 고정 컨텍스트 문자열(토큰 예산 내)

수집 소스(토큰 예산):
- 최근 승인 요약 (episode_summary WHERE is_confirmed)
- storyline 관련 청크 (episode_chunk ORDER BY embedding<=>$vec)
- 작가 프로필 / 작품 메타데이터
"""
