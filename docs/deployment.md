# Folio — 배포 구현 문서

## 개요

EC2 단일 서버에 Docker Compose 기반으로 전체 서비스를 운영한다.
Blue/Green 전략으로 무중단 배포하며, 환경변수는 Doppler로 중앙 관리한다.

---

## 1. Docker 환경 구성

| 환경 | 목적 | Compose 파일 | 데이터 | 앱 실행 |
|------|------|-------------|--------|---------|
| **dev** | 로��� 개발 | `infra/dev/docker-compose.dev.yml` | 볼륨 영속 | 로컬 직접 (HMR) |
| **test** | CI 통합테스트 | `infra/test/docker-compose.test.yml` | tmpfs (매번 초기화) | 컨테이너 빌드 |
| **prod** | 프로덕션 | `infra/prod/docker-compose.yml` + blue/green | 볼륨 영속 | pre-built 이미지 |

### Test vs Prod 핵심 차이

- **Test**: 소스에서 직접 빌드 (`build:`), tmpfs로 데이터 초기화, 테스트 후 `down -v`로 폐기
- **Prod**: CI에서 빌드한 이미지 pull (`image:`), 영속 볼륨, Blue/Green 무중��� 교체

---

## 2. Dockerfile ��드 전략

모든 Dockerfile은 `infra/dockerfiles/`에 위치.

| Dockerfile | ��드 전략 | 베이스 이미지 | 결과 |
|------------|----------|-------------|------|
| `Dockerfile.spring` | Multi-stage (JDK → JRE) | `eclipse-temurin:21` | ~200MB |
| `Dockerfile.fastapi` | 단일 스테이지 | `python:3.13-slim` | ~400MB |
| `Dockerfile.celery-worker` | 단일 스테이지 | `python:3.13-slim` | ~400MB |
| `Dockerfile.web` | Multi-stage (Node → Nginx) | `node:22` → `nginx:1.30` | ~30MB |

### 프론트엔드 빌드 주의사항

`Dockerfile.web`은 Vite 빌드 시점에 `VITE_*` 환경변수를 `ARG`로 주입한다:
```bash
docker build -f infra/dockerfiles/Dockerfile.web \
  --build-arg VITE_API_URL=https://folio.example.com/api \
  --build-arg VITE_POWERSYNC_URL=https://folio.example.com/sync \
  -t folio-web:latest .
```

이 값들��� JS 번들에 하드코딩되므로 환경별로 다른 이미지가 생성된다.

---

## 3. Production Compose 구조

3개 파일로 분리하여 Blue/Green 배포를 지원:

```
infra/prod/
├── docker-compose.yml          # 공유 서비스 (Nginx, DB, Redis, MongoDB, PowerSync, Certbot)
├── docker-compose.blue.yml     # Blue 앱 인스턴스 (backend, ai, worker, web)
├── docker-compose.green.yml    # Green 앱 인스턴스
└── nginx/
    ├── nginx.conf              # SSL + 리버스프록시
    ├── nginx-init.conf         # SSL 초기 발급용 (HTTP-only)
    ├── upstream-blue.conf      # Blue upstream 정의
    ├── upstream-green.conf     # Green upstream 정의
    └── upstream-active.conf    # 현재 활성 (blue/green ��� 하나의 복사본)
```

### 공유 서비스 (배포 시 교체 안 됨)

| 서비스 | 이미지 | 용도 |
|--------|--------|------|
| nginx | `nginx:1.30-alpine` | SSL 종료, 리버스프록시, upstream 전환 |
| postgresql | `pgvector/pgvector:pg17` | 앱 DB (WAL logical replication) |
| redis | `redis:8-alpine` | Refresh Token, Celery broker |
| mongo | `mongo:8` | PowerSync bucket storage (replica set) |
| powersync | `journeyapps/powersync-service` | 클라이언트 동기화 엔진 |
| certbot | `certbot/certbot` | SSL 인증서 자동 갱신 |

### 앱 인스턴스 (Blue/Green 교체)

| ���비스 | Blue 포트 | Green 포트 |
|--------|----------|-----------|
| Spring Boot | 8081 | 8082 |
| FastAPI | 8091 | 8092 |
| Celery Worker | (내부) | (내부) |
| React Web | 3001 | 3002 |

---

## 4. Blue/Green 배포 흐름

`infra/scripts/deploy.sh <IMAGE_TAG>` 실행 시:

```
1. /opt/folio/active-color 읽기 (예: blue)
2. 반대 색상 결정 (green)
3. Doppler에서 prd 시크릿 → .env 다운로드
4. green 이미지 pull
5. green 컨테이너 기동
6. 헬스체크 (backend /actuator/health, ai /v1/health, web /healthz)
   └─ 실패 시: green 종료, blue 유지 (롤백)
7. nginx upstream을 green으로 전환 + reload
8. 5초 안정화 대기
9. blue 컨테이너 종료
10. active-color → green 업데이트
11. .env 삭제 + 미사용 이미지 정리
```

### 롤백

배포 중 헬스체크 실패 시 자동 롤백됨. 배포 완료 후 문제 발견 시:

```bash
# 수동 롤백: 이전 색상으로 되돌리기
cd /opt/folio/infra/prod
CURRENT=$(cat /opt/folio/active-color)
PREV=$( [ "$CURRENT" = "blue" ] && echo "green" || echo "blue" )

# 이전 이미지 태그로 기동 (latest가 이전 버전이면)
docker compose -f docker-compose.yml -f docker-compose.${PREV}.yml up -d
bash ../scripts/health-check.sh http://localhost:$PREV_PORT/actuator/health
cp nginx/upstream-${PREV}.conf nginx/upstream-active.conf
docker compose exec nginx nginx -s reload
docker compose -f docker-compose.${CURRENT}.yml down
echo "$PREV" > /opt/folio/active-color
```

---

## 5. Nginx 라우팅

```
https://folio.example.com
  ├─ /                    → upstream frontend (React Web SPA)
  ├─ /api/*               → upstream backend (Spring Boot)
  ├─ /sync/*              → powersync:8080 (WebSocket upgrade)
  └─ /.well-known/acme-challenge/ → /var/www/certbot
```

- HTTP(80) → HTTPS(443) 자동 리다이렉트
- WebSocket: `proxy_read_timeout 86400s` (sync 장시간 연결)
- Security headers: HSTS, X-Frame-Options, X-Content-Type-Options

---

## 6. SSL 구성

Let's Encrypt + Certbot 사용. 초기 발급은 [ec2-setup-guide.md](ec2-setup-guide.md) 참고.

- 인증서 경로: `/opt/folio/data/certbot/conf/live/<domain>/`
- 자동 갱신: certbot 사이드카 컨테이너 (12시간마다 `certbot renew`)
- 갱신 후 nginx는 자동 반영 (심볼릭 링크 → 최신 인증서)

---

## 7. 백업/복원

### 일일 백업 (`infra/scripts/backup.sh`)

| 대상 | 도구 | 저장 위치 |
|------|------|----------|
| PostgreSQL | `pg_dump` → gzip | S3 `daily/`, `weekly/`, `monthly/` |
| MongoDB | `mongodump` → gzip | S3 `daily/`, `weekly/`, `monthly/` |

보존 정책: 일일 7일, 주간 4주, 월간 3개월.

cron: `0 3 * * *` (매일 새벽 3시)

### 복원

```bash
# PostgreSQL 복원
gunzip -c pg-2026-04-22.sql.gz | docker exec -i folio-postgresql-prod \
  psql -U folio -d folio

# MongoDB 복원
docker exec -i folio-mongo-prod mongorestore \
  --archive --gzip --db powersync < mongo-2026-04-22.gz
```

---

## 8. 트러블슈팅

### 컨테이너가 시작되지 않음

```bash
# 로그 확인
docker compose -f docker-compose.yml -f docker-compose.blue.yml logs <service-name>

# 환경변수 확인
docker compose -f docker-compose.yml -f docker-compose.blue.yml config
```

### PowerSync 연결 실패

- PostgreSQL WAL 설정 확인: `SHOW wal_level;` → `logical` 이어야 함
- MongoDB replica set 상태: `docker exec folio-mongo-prod mongosh --eval "rs.status()"`
- replication role 확인: `SELECT rolname FROM pg_roles WHERE rolname = 'folio_repl';`

### Nginx 502 Bad Gateway

- 백엔드 컨테이너 상태 확인: `docker ps | grep folio-backend`
- upstream-active.conf가 현재 활성 색상과 일치하는지 확인
- `docker compose exec nginx nginx -t` 로 설정 문법 검사

### OOM (Out of Memory)

- MongoDB cache 제한 확인: `--wiredTigerCacheSizeGB 0.5`
- JVM 힙 제한 확인: `JAVA_OPTS=-Xms512m -Xmx1024m`
- `docker stats`로 실시간 메모리 모니터링

---

## 관련 문서

| 문서 | 내용 |
|------|------|
| [ec2-setup-guide.md](ec2-setup-guide.md) | EC2 서버 초기 설정 단계별 가이드 |
| [gitlab-ci-guide.md](gitlab-ci-guide.md) | GitLab CI/CD 설정 + 파이프라인 가이드 |
| [infra.md](infra.md) | 인프라 설계 원본 |
| [doppler-setup.md](doppler-setup.md) | 환경변수 관리 |
| [pre-deployment-considerations.md](pre-deployment-considerations.md) | 운영 전 체크리스트 |
