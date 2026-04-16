"""Phase 2 (Day 3) 예정.

회차 본문을 500~1,000 토큰 청크로 나누고 임베딩하여
`episode_chunk` 테이블에 UPSERT 한다.

구현 순서:
1. episode.content 조회 (plain text 추출)
2. tiktoken 기반 단락 → 문장 재분할
3. OpenAI `text-embedding-3-small` 배치 호출
4. episode_chunk UPSERT (UNIQUE(episode_id, chunk_index))
"""
