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
├── pyproject.toml
├── requirements.txt
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

# 의존성 설치
pip install -r requirements.txt

# FastAPI 서버 실행
uvicorn app.main:app --reload --port 8000
```

## requirements.txt 예시

```
fastapi
uvicorn[standard]
celery[redis]
redis
httpx
python-dotenv
pydantic-settings
```

## 환경변수

```env
REDIS_URL=redis://localhost:6379/0
OPENAI_API_KEY=your-key-here
CLAUDE_API_KEY=your-key-here
```
