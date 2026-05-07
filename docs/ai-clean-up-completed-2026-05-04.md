# AI 서버 환경 Clean-up — 완료 기록 (2026-05-04)

> **상태**: 완료. 본 문서는 Clean-up Phase 작업 산출물 보존용. KMS 전환 작업 시 참고.

## 완료 산출물

### 통째 삭제
- `ai/app/services/repetition_detector.py`
- `ai/app/services/structural_validators.py`
- `ai/app/services/timeline_extractor.py`
- `backend/src/main/java/com/storyzip/ai/service/EpisodeIndexDebouncer.java`

### 수정
- `ai/app/api/v1/reviews.py` — 결정론 머지·MCP 비활성 주석 제거 + 검수 시스템 프롬프트에 LLM 직접 판단 영역 추가 (반복·메타·날짜·시간 + score 산정)
- `ai/app/services/rag.py` — `'draft'` 하위호환 키 제거 + `TIMELINE_MODES` 제거 + `template` 의 timeline 행 제거 + mode 필수 인자화
- `ai/app/celery_app.py` — `generate_draft` / `run_review` leftover 라우팅 제거
- `ai/app/schemas/ai_context_payload.py` — KMS 통합 예정 docstring 추가

### 문서 정합화
- `docs/kek.md` — KMS 모델 전환 결정 박스 추가
- `docs/security/encryption-plan-C-oauth-derived.md` — KMS 모델 비교표 + 한 줄 결론 갱신
- `docs/ai-overview.md` §4.1 — 자동 인덱싱 미동작 상태 명시
- `docs/ai-server-architecture.md` — `chunk_and_embed_task` 호출 hook 끊김 + `generate_summary_task` 미동작 표기
- `docs/ai-server-current-state.md` — Top 5 리스크 #1 갱신 + #3 해결 완료 표기
- `docs/ai-runtime-pipeline-current.md` — 모드별 limit 정정 + timeline 폐기 반영
- `docs/ai-erd.md` — KMS 채택 + 결정론 폐기 + EpisodeIndexDebouncer 폐기 헤더 메모

### 검증 결과
- ✅ Python syntax 모두 정상
- ✅ 잔여 참조 0건 (의도된 docstring 보존 제외)
- ✅ unused import 0건
- ⚠ pytest 는 Docker dev 환경에서 별도 검증 필요

## 다음 단계 (KMS 전환 작업)
plan 파일 (`C:\Users\SSAFY\.claude\plans\curious-wiggling-thacker.md`) 참조.
