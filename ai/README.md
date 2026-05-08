# Folio AI Server (FastAPI)

## 기술 스택

| 항목 | 버전 |
|------|------|
| Python | 3.12 |
| FastAPI | latest |
| Uvicorn | ASGI 서버 |
| Celery | 비동기 태스크 큐 |
| Redis | Celery broker |
| httpx | AI API 호출 |

## 역할

Spring Boot에서 분리된 AI 전용 서버.

| 기능 | 설명 |
|------|------|
| AI API 호출 | OpenAI, Claude 등 외부 AI API 호출 |
| 프롬프트 처리 | 템플릿 기반 프롬프트 구성 및 실행 |
| 비동기 처리 | Celery를 통한 AI 요청 비동기 처리 |

## 권장 디렉토리 구조

```
ai/
├── pyproject.toml          # 의존성 단일 진실 출처 (base + [db] + [llm] + [dev] 옵셔널 그룹)
├── app/
│   ├── main.py           # FastAPI 진입점
│   ├── config.py          # 환경변수 설정
│   ├── routers/
│   │   ├── analysis.py    # 설정 충돌/톤 분석
│   │   └── suggestion.py  # 문장 제안, 요약
│   ├── services/
│   │   ├── ai_client.py   # AI API 클라이언트
│   │   └── prompt.py      # 프롬프트 템플릿 처리
│   └── tasks/
│       └── celery_tasks.py # Celery 비동기 태스크
└── tests/
```

## 개발 환경 접속 정보

| 서비스 | 호스트 | 포트 | 용도 |
|--------|--------|------|------|
| Redis | localhost | 6379 | Celery broker |

## 실행

```bash
# 사전 요구: Docker 인프라 기동
docker compose -f infra/dev/docker-compose.dev.yml up -d

# 가상환경 생성 및 활성화
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 의존성 설치 — pyproject.toml 의 base + 옵셔널 그룹 [db] [llm] [dev] 까지 한 번에
pip install -e ".[llm,db,dev]"

# FastAPI 서버 실행
uvicorn app.main:app --reload --port 8000
```

## 의존성 그룹 — pyproject.toml

| 그룹 | 패키지 | 필요 시점 |
|------|--------|-----------|
| base | anthropic, fastapi, uvicorn, pydantic, celery, redis, httpx, structlog, prometheus | 항상 |
| [db] | sqlalchemy[asyncio], asyncpg, **pgvector**, alembic | DB · 벡터 검색 도구 사용 시 (사실상 항상) |
| [llm] | openai, tiktoken, tenacity | 임베딩 / OpenAI 호출 시 |
| [dev] | pytest, pytest-asyncio, ruff, mypy | 테스트 / 린트 |

기본 `pip install -e .` 만 하면 옵셔널 그룹이 빠져 import 실패합니다. 항상 `[llm,db]` 이상으로 설치하세요.

## 환경변수

```env
REDIS_URL=redis://localhost:6379/0
OPENAI_API_KEY=your-key-here
CLAUDE_API_KEY=your-key-here
```
