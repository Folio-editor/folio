# Folio — 배포 전 추가 작업 · 고려사항

> **작성일**: 2026-04-16
> **상태**: 설계 단계를 지나 핵심 기능(인증 · 동기화 · 결제)이 구현된 시점 기준
> **목적**: 정식 운영 환경으로 넘어가기 전 반드시 점검하거나 추가해야 할 운영·보안·인프라 작업 정리. 단순 기능 미구현 목록이 아닌, **"지금 부족하지 않지만 운영 시 치명적이 될 수 있는 것들"**에 초점.

본 문서는 개발자가 "지금은 되는데 운영에서 왜 터질 수 있지?"를 미리 알 수 있도록 설명 중심으로 작성한다.

---

## 목차

1. [운영 진입 전 우선순위 요약](#1-운영-진입-전-우선순위-요약)
2. [MongoDB (PowerSync bucket storage)](#2-mongodb-powersync-bucket-storage)
3. [PowerSync 서비스 안정화 보강](#3-powersync-서비스-안정화-보강)
4. [백엔드 보안 하드닝](#4-백엔드-보안-하드닝)
5. [관측성 (Observability)](#5-관측성-observability)
6. [백업 · 재해 복구 (DR)](#6-백업--재해-복구-dr)
7. [비밀 관리 · 키 로테이션](#7-비밀-관리--키-로테이션)
8. [SSL · DNS · 리버스 프록시](#8-ssl--dns--리버스-프록시)
9. [배포 전략 · 롤백](#9-배포-전략--롤백)
10. [성능 · 용량 산정](#10-성능--용량-산정)
11. [기능 레벨 미구현 (참고)](#11-기능-레벨-미구현-참고)
12. [프로덕션 진입 체크리스트](#12-프로덕션-진입-체크리스트)

---

## 1. 운영 진입 전 우선순위 요약

"설정 하나 빠져서 전 사용자 장애" 수준으로 **치명적인 것부터** 정렬:

| 순위 | 항목 | 왜 치명적인가 |
|:---:|------|--------------|
| 🔴 P0 | MongoDB 단일 노드 | SPoF. 죽으면 전 사용자 sync 중단 |
| 🔴 P0 | PowerSync op log 무한 증가 | compaction 미설정 → MongoDB 디스크 폭발 |
| 🔴 P0 | SSL 미적용 | OAuth·JWT 평문 노출, 사실상 운영 불가 |
| 🔴 P0 | 백업 전략 부재 | PG/Mongo 볼륨 손상 시 복구 불가 |
| 🟡 P1 | Rate limiting 부재 | 무료 AI 기능 악용·DDoS 무방비 |
| 🟡 P1 | 로그 수집 부재 | 장애 발생 후 원인 추적 불가 |
| 🟡 P1 | JWT key rotation 경로 없음 | 키 유출 시 대응 불가 |
| 🟢 P2 | Blue/Green 미구성 | 배포 시 서비스 일시 중단 |
| 🟢 P2 | 메트릭 수집 부재 | 부하 징후 사전 감지 불가 |

P0는 **정식 오픈 전 필수**, P1은 **오픈 후 1개월 내**, P2는 **성장 단계에서 단계적 도입** 기준.

---

## 2. MongoDB (PowerSync bucket storage)

### 2.1 왜 MongoDB가 필요한가

Folio 기준 MongoDB는 **앱 데이터를 저장하지 않는다.** PowerSync Service가 클라이언트별 동기화 상태를 추적하기 위한 **내부 전용 저장소**다.

```
PostgreSQL  = 앱 원본 데이터 (work, episode, character …)
              → 사실 관계의 원천 (source of truth)

MongoDB     = PowerSync의 sync 상태
              → "누가 어디까지 받아갔나" 기록용
```

저장 내용:
- **Bucket 스냅샷** — `user_workspace[writer_id=UUID]` 단위 포함 행 목록
- **Operation log** — PostgreSQL WAL에서 받은 이벤트를 bucket별 op로 분해한 스트림
- **Client checkpoint** — 각 기기가 어느 op까지 받았는지 진행 포인터
- **파라미터 쿼리 캐시** — `select id from character where writer_id = ?` 등 종속 id 목록

### 2.2 왜 Replica Set이어야 하나

PowerSync는 MongoDB **change streams**로 새 op 발생을 감지하여 클라이언트에 push한다. change streams는 replica set에서만 동작 → `--replSet rs0` 필수.

현재 [docker-compose.dev.yml](../infra/dev/docker-compose.dev.yml)는 **1-노드 replica set**. change streams는 동작하지만 **HA는 없음**.

### 2.3 반드시 해결해야 할 3가지 (P0)

#### (a) Op log 무한 증가 — compaction

PowerSync op log는 **모든 PATCH를 영구 기록**한다. 자동 정리 기본 OFF.

**영향 시뮬레이션**:
- 자동저장 2초 주기 × 활성 집필 3시간/일 = 약 5,400 op/사용자/일
- 사용자 1000명 × 1년 = **약 20억 op**
- MongoDB 디스크 수십 GB 이상

**해결**:
```yaml
# infra/powersync/powersync.yaml 프로덕션 전 추가 검토
# PowerSync 버전에 따라 키 이름 다를 수 있음 — 공식 문서 확인 필수
storage:
  type: mongodb
  uri: !env PS_MONGO_URI
  # 예: op 보존 기간, 체크포인트 압축 주기 등
```

PowerSync 공식 문서의 "compaction" / "retention" 섹션 확인 필요 (버전별 상이).

#### (b) 3-노드 replica set 승급

```yaml
# 프로덕션용 예시 (test/prod compose에 반영 예정)
mongo-1:
  image: mongo:7
  command: ["--replSet", "rs0", "--bind_ip_all"]
  volumes: [storyzip-mongo-1:/data/db]
mongo-2:
  image: mongo:7
  command: ["--replSet", "rs0", "--bind_ip_all"]
  volumes: [storyzip-mongo-2:/data/db]
mongo-3:
  image: mongo:7
  command: ["--replSet", "rs0", "--bind_ip_all"]
  volumes: [storyzip-mongo-3:/data/db]
```

replica init:
```js
rs.initiate({
  _id: 'rs0',
  members: [
    { _id: 0, host: 'mongo-1:27017' },
    { _id: 1, host: 'mongo-2:27017' },
    { _id: 2, host: 'mongo-3:27017' }
  ]
})
```

Primary 장애 시 자동 Secondary 승격 → sync 중단 없음.

#### (c) 메모리 분리

MongoDB WiredTiger는 기본으로 **호스트 물리 메모리 절반**까지 캐시 점유. 4GB 호스트면 2GB 사용. Spring Boot(~1.5GB) + Mongo(~2GB) + PowerSync(~500MB) = **OOM 위험**.

해결안:
1. **MongoDB 전용 인스턴스** 분리 (`t3.small` 2GB 한 대로도 충분)
2. 또는 Mongo `wiredTiger.engineConfig.cacheSizeGB=1` 명시로 상한 제한

### 2.4 모니터링 지표 (P1)

Prometheus `mongodb_exporter` 기준:
| 메트릭 | 임계값 | 의미 |
|--------|--------|------|
| `mongodb_mongod_replset_member_state` | != 1 (PRIMARY) | 장애 알림 |
| `mongodb_mongod_storage_db_size_bytes` | 급증 추세 | compaction 미동작 징후 |
| `mongodb_memory{type="resident"}` | > 80% cache | 캐시 압박 |
| `mongodb_op_counters_total{op="query"}` | 추세 감시 | sync 트래픽 규모 |

### 2.5 장기 옵션

| 선택지 | 장점 | 단점 |
|--------|------|------|
| **현행 유지 (Open Edition + MongoDB)** | 라이선스 비용 0 | Mongo 운영 부담 |
| **PowerSync Enterprise** | PostgreSQL bucket storage로 통일, Mongo 제거 | 유료 라이선스 |
| **자체 구현 대체** (ElectricSQL 등) | 벤더 독립 | 구조 대규모 변경, 위험 큼 |

베타~중규모까지는 **현행 유지 + 3노드 승급**이 현실적.

---

## 3. PowerSync 서비스 안정화 보강

### 3.1 Proactive Sync Reconnect (Phase B, 보류 중)

현재 [tokenRefreshScheduler.ts](../frontend/src/main/auth/tokenRefreshScheduler.ts)는 Access Token을 만료 2분 전 무음 갱신 (Phase A 완료). 그러나:

- 갱신된 새 토큰을 **PowerSync WebSocket이 자동으로 사용하지 않음**
- 만료까지 유지된 기존 세션이 서버 측에서 끊기면 그제서야 SDK가 fetchCredentials 재호출 → 짧은 sync 갭 발생

**Phase B 권장 시점**: 베타 중 실사용자에게서 sync 끊김 리포트가 반복되면 추가.

구현 방향 (요약):
- Main → Renderer `auth:access-token-refreshed` IPC
- Renderer에서 `db.connect(connector)` 재호출 또는 connector의 `invalidateCredentials()` 명시 호출

### 3.2 Sync rule 버전 관리

[sync-rules.yaml](../infra/powersync/sync-rules.yaml) 변경 시 **모든 클라이언트가 재동기화** 트리거. 운영 중 변경은 신중해야 함.

**권장 절차**:
1. 스키마 변경(예: 컬럼 추가)은 먼저 PostgreSQL + 프론트 schema.ts에 반영
2. 배포 후 전체 롤아웃 확인
3. sync-rules.yaml 변경은 별도 배포 사이클
4. powersync 컨테이너 재기동 → 자동 재검증

### 3.3 PowerSync 서비스 HA

현재 PowerSync Service는 **단일 인스턴스**. 장애 시:
- 접속 중 클라이언트 → WS 끊김
- 재연결 시도 반복 (지수 백오프)
- 서비스 복구 후 자동 재연결 (로컬 데이터는 무사)

**완화책**:
- systemd/docker restart policy `unless-stopped` (현재 적용됨)
- healthcheck 실패 시 자동 재기동

정식 프로덕션에서는 PowerSync 인스턴스 복수 배치 + Nginx upstream 가능하지만, Open Edition 기준 다중 인스턴스 동작 검증 필요.

---

## 4. 백엔드 보안 하드닝

### 4.1 Rate Limiting (P1, 미구현)

현재 Spring Security 설정에 rate limit 없음. 취약 지점:
- `/api/v1/auth/login/google` — 계정 탈취 시도
- `/api/v1/sync/upload` — 악의적 대량 upsert
- `/api/v1/auth/refresh` — 무한 토큰 발급 요청
- AI 중계 엔드포인트 (도입 시) — 토큰 소진 공격

**권장 구현**:
- **Redis 기반 sliding window** (버킷당 분당 N회)
- 라이브러리: `bucket4j-spring-boot-starter` 또는 Spring Cloud Gateway (Nginx 단에서 처리도 가능)

### 4.2 CORS 정책 프로덕션 전환

현재 [CorsConfig.java](../backend/src/main/java/com/storyzip/config/CorsConfig.java):
```java
config.setAllowedOriginPatterns(List.of(
    "http://localhost:*",
    "http://127.0.0.1:*",
    "app://*",
    "file://*"
));
```

→ 프로덕션에서는 **정확한 도메인만 허용**:
```java
// prod profile
config.setAllowedOrigins(List.of("https://storyzip.com"));
// Electron 앱은 app:// 스킴만, file:// 제거 (XSS 회피)
```

### 4.3 입력 검증 강화

- `SyncUploadRequest` — 현재 `@NotBlank`만. `op` 값 enum 검증, `table` 화이트리스트 검증 추가 권장
- 파일 업로드 엔드포인트 (내보내기 도입 시) — MIME/확장자/크기 검증

### 4.4 민감 정보 로그 마스킹

현재 Spring Boot 기본 로그. 운영 진입 전:
- Access Token / Refresh Token 부분 마스킹
- 이메일은 첫 3자 + `***@도메인`
- Logback `PatternLayoutEncoder` + 커스텀 converter 또는 `logback-spring.xml`에 필터

### 4.5 Security Headers

Nginx에서 추가 (현재 Nginx 설정 미완성):
```
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; ..." always;
```

---

## 5. 관측성 (Observability)

[infra.md](./infra.md)에 **PLG + Prometheus** 예정으로 명시됨. 미도입 상태.

### 5.1 로그 (P1)

| 구성요소 | 계획 |
|----------|------|
| **Promtail** | 각 컨테이너 로그 수집 에이전트 |
| **Loki** | 중앙 로그 저장소 |
| **Grafana** | 쿼리·알림 UI |

최소한의 구조화 로그 필드:
- `trace_id` (분산 추적 시 필수)
- `writer_id`
- `path`, `status`, `duration_ms`
- `user_agent`
- 에러는 stack trace full

Spring Boot는 `logback-spring.xml` + MDC로 trace_id 주입. 구현 필요.

### 5.2 메트릭 (P1/P2)

| 대상 | exporter | 주요 메트릭 |
|------|----------|-------------|
| Spring Boot | `micrometer-registry-prometheus` | `/sync/upload` p95 latency, JVM heap, HTTP 5xx rate |
| PostgreSQL | `postgres_exporter` | connection pool, slow query, replication lag |
| MongoDB | `mongodb_exporter` | op/s, memory, replica state |
| PowerSync | 자체 `/probes` + 커스텀 | 연결 수, sync lag |
| Redis | `redis_exporter` | memory, evicted keys |

### 5.3 에러 트래킹 (P1)

Sentry 또는 Datadog — 프론트/백 양쪽 필요.
- 프론트엔드: 렌더러 uncaught error + ps_crud 업로드 실패 추적
- 백엔드: Spring `@ControllerAdvice`에서 Sentry SDK 연동

### 5.4 알림 채널

- Grafana alerts → Slack/Discord webhook
- 핵심 알림: 5xx rate 급증, DB connection 고갈, MongoDB replica down, 디스크 80%↑

---

## 6. 백업 · 재해 복구 (DR)

### 6.1 PostgreSQL

| 주기 | 방법 |
|------|------|
| 일 1회 | `pg_dump` → S3 (암호화) |
| 실시간 | PITR을 위한 WAL 아카이빙 (선택) |
| 주 1회 | 복원 테스트 (다른 EC2로 pg_restore) |

복원 리허설을 **하지 않으면 백업은 없는 것과 같다.**

### 6.2 MongoDB

| 주기 | 방법 |
|------|------|
| 일 1회 | `mongodump` → S3 |
| 실시간 | replica set 추가 노드 (warm standby) |
| 필요 시 | 볼륨 snapshot |

MongoDB가 복구 불가능해져도 **PostgreSQL은 무사** → PowerSync가 bucket 재구축. 단 재동기화 중 일시적 service degradation 발생.

### 6.3 Redis

Redis는 RT 저장소. 날아가도 "전 사용자 재로그인 필요" 정도의 영향. AOF 활성화로 충분 (이미 compose에 `--appendonly yes` 적용).

### 6.4 클라이언트 로컬 SQLite

사용자 기기에 있는 OPFS. **백업 불가 (브라우저 격리)**.
→ 반드시 서버 sync 성공한 데이터만 "진짜 저장된 것"으로 간주. 이게 PowerSync 설계의 핵심.

### 6.5 복구 목표 (RTO/RPO)

| 지표 | 베타 목표 | 정식 목표 |
|------|----------|----------|
| RTO (복구 시간) | 4시간 | 30분 |
| RPO (데이터 손실 허용) | 24시간 | 5분 |

정식 목표 달성하려면 WAL 아카이빙 + 3노드 Mongo 필수.

---

## 7. 비밀 관리 · 키 로테이션

### 7.1 Doppler 프로젝트 구성

현재: dev 프로파일 중심. 정식 배포 전 필요한 것:
- **prd 프로파일 분리** — 프로덕션 전용 secrets
- **stg 프로파일** (선택) — 프로덕션 이관 전 검증용
- Service Token per environment (CI/CD에서 사용)

### 7.2 JWT Secret 로테이션

현재 `JWT_SECRET` + `PS_JWT_K`가 **고정**. 유출 시 대응 절차 없음.

**권장 절차**:
1. 신규 secret 발급 + 새 kid(`storyzip-prod-v2`) 부여
2. `powersync.yaml`의 jwks.keys에 **두 키 병존** 기간 설정
3. 백엔드는 새 kid로 발급 시작
4. 기존 토큰 자연 만료(AT 30분) 후 구 키 제거

→ 이를 위해 **multi-key JWKS 지원 구조** 미리 준비 필요.

### 7.3 OAuth 자격증명

Google `CLIENT_SECRET` 유출 시 즉시 폐기 + 재발급. Google Cloud Console에서 처리.

### 7.4 DB 자격증명

`storyzip_repl_dev` 같은 **하드코딩된 dev 패스워드** 프로덕션 금지. Doppler로 전환.

현재 [powersync-init.sql](../infra/db/powersync-init.sql)에 하드코딩:
```sql
CREATE ROLE powersync_repl WITH LOGIN REPLICATION PASSWORD 'storyzip_repl_dev';
```
→ 프로덕션은 env 주입 방식으로 전환 필요 (template + entrypoint script).

---

## 8. SSL · DNS · 리버스 프록시

### 8.1 현재 상태

- Nginx 설정 **미완성** (파일 존재 유무 확인 필요)
- SSL **미적용**
- [architecture.md](./architecture.md)에 "Let's Encrypt + Certbot (예정)" 표기

### 8.2 최소 Nginx 구성 (권장)

```nginx
# /etc/nginx/sites-enabled/storyzip.conf
server {
    listen 443 ssl http2;
    server_name storyzip.com;

    ssl_certificate     /etc/letsencrypt/live/storyzip.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/storyzip.com/privkey.pem;

    # 정적 랜딩
    location / {
        root /var/www/landing;
    }
    # 웹 에디터
    location /editor {
        root /var/www/editor;
        try_files $uri /editor/index.html;
    }
    # 백엔드 API
    location /api/ {
        proxy_pass http://backend:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    # PowerSync sync stream (WebSocket)
    location /sync/ {
        proxy_pass http://powersync:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}

server {
    listen 80;
    server_name storyzip.com;
    return 301 https://$host$request_uri;
}
```

WebSocket 경로에 **`proxy_read_timeout` 크게 설정** 중요 (sync stream은 장시간 연결 유지).

### 8.3 Certbot 자동 갱신

```bash
# cron
0 3 * * * certbot renew --quiet --post-hook "docker compose kill -s SIGHUP nginx"
```

### 8.4 Electron 앱의 API 엔드포인트

- 개발: `http://127.0.0.1:8080`
- 프로덕션: `https://storyzip.com/api/v1`

Doppler `VITE_API_URL` / `VITE_POWERSYNC_URL` 프로파일별 분리.

---

## 9. 배포 전략 · 롤백

### 9.1 Blue/Green (P2, 계획만 있음)

현재 [architecture.md](./architecture.md)에 "예정" 상태. 단일 EC2 + Docker Compose 기반이라 Blue/Green 구현은 다음과 같은 방식:

```
[Blue compose-blue.yml]  — 포트 8081 (backend), 8091 (powersync)
[Green compose-green.yml] — 포트 8082, 8092
[Nginx upstream 전환]
```

배포 순서:
1. Green 스택 기동 + healthcheck 통과 대기
2. Nginx `upstream` 서버 주소 교체 + `nginx -s reload`
3. 5분 관측
4. Blue 스택 종료

**데이터 마이그레이션은 별개**. 스키마 변경은 backward compatible로 단계 적용:
- Phase 1: 새 컬럼 NULLABLE 추가
- Phase 2: 애플리케이션 코드 배포 (신규 컬럼 사용)
- Phase 3: (필요 시) 컬럼 제약 추가 / 구 컬럼 제거

### 9.2 롤백 시나리오

- **코드만 문제**: `git revert` + 재배포 (10분 이내)
- **DB 마이그레이션 문제**: Phase로 나눴다면 코드만 revert. 파괴적 마이그레이션이라면 pg_dump 복원
- **PowerSync sync rule 문제**: 이전 yaml로 되돌리기 + `docker compose restart powersync`

### 9.3 CI/CD 성숙도

GitLab CI self-hosted runner 구성은 있으나 실제 파이프라인 스크립트 미확인. 최소 파이프라인:
- `test` (unit + 통합)
- `build` (Docker image push to registry)
- `deploy` (SSH + docker compose pull + up -d)

---

## 10. 성능 · 용량 산정

### 10.1 현재 추정치 (사용자 1000명 기준)

| 자원 | 예상 소비 |
|------|----------|
| PostgreSQL 데이터 | ~5GB/년 (작품당 평균 5MB × 1000명) |
| MongoDB op log (compaction 후) | ~10GB/년 |
| S3 백업 | ~20GB/년 |
| 네트워크 상행 | 피크 10Mbps |
| 동시 WS 연결 | ~200 (로그인 상태 20%) |
| API RPS | 평균 10, 피크 100 |

t3.medium (2 vCPU / 4GB RAM) 1대 + 별도 MongoDB 인스턴스 정도로 커버 가능. 단 위 가정은 **compaction 정상 동작 전제**.

### 10.2 DB 튜닝 체크리스트

PostgreSQL:
- `shared_buffers` = 25% of RAM
- `effective_cache_size` = 75% of RAM
- connection pool: HikariCP 기본값 검증 (현재 Spring Boot 기본 10 maximum)
- 인덱스: `work.writer_id`, `episode.work_id`, `character.work_id` 등 FK에 자동 인덱스 확인

MongoDB:
- WiredTiger cache 상한 명시 (`wiredTiger.engineConfig.cacheSizeGB`)

### 10.3 프론트엔드 성능

- TipTap 에디터에 **긴 원고(10만자+)** 로드 시 프레임 드랍 가능. 청크 로딩/가상화 고려
- `useQuery` 반응형 쿼리 다수 → re-render 폭발 가능. React DevTools Profiler로 측정 필요

---

## 11. 기능 레벨 미구현 (참고)

[architecture.md](./architecture.md)에 명시된 항목이지만, 운영 관점에서는 "없어도 서비스 가능"이라 P2 이하로 분류:

| 기능 | 비고 |
|------|------|
| AI 중계 (FastAPI) | 프리미엄 기능. 미구현이라도 기본 집필 기능은 완전 |
| DOCX/PDF/TXT 내보내기 | 사용자가 요구할 시점에 추가 |
| 알림 | 결제/동기화 관련 토스트는 이미 프론트에서 처리 |
| 웹 플랫폼 분기 | Electron만으로도 베타 진행 가능 |

운영 관점의 우선순위는 **위의 P0~P1 항목들**이 우선.

---

## 12. 프로덕션 진입 체크리스트

### Beta Open 전 (P0)
- [ ] SSL 인증서 발급 + Nginx HTTPS 구성
- [ ] Doppler `prd` 프로파일 구성 + CI 연결
- [ ] PostgreSQL 일일 백업 스크립트 + S3 업로드
- [ ] MongoDB 일일 `mongodump` + 복원 테스트 1회
- [ ] PowerSync op log compaction 설정 적용
- [ ] `powersync-init.sql`의 `powersync_repl` 비밀번호 env 주입 전환
- [ ] CORS `allowedOrigins` 프로덕션 도메인으로 제한
- [ ] `logout`/`logoutAllDevices` 엔드포인트 실사용 검증

### Beta 1개월 내 (P1)
- [ ] PLG + Prometheus 기본 대시보드
- [ ] Sentry 또는 에러 트래킹 도입
- [ ] Rate limiting (bucket4j)
- [ ] 민감 정보 로그 마스킹
- [ ] Security headers (Nginx)
- [ ] MongoDB 3-노드 replica set 승급
- [ ] JWT multi-key JWKS 구조 준비 (키 로테이션 대비)

### 성장 단계 (P2)
- [ ] Blue/Green 배포 자동화
- [ ] PowerSync 다중 인스턴스 검증 또는 Enterprise 전환 ROI 검토
- [ ] 자동 스케일링 (EC2 Auto Scaling Group 또는 ECS)
- [ ] CDN (CloudFront) — 웹 에디터 정적 자산
- [ ] MongoDB 샤딩 (writer_id 기준) 검토

---

## 관련 문서

| 문서 | 관련 내용 |
|------|----------|
| [architecture.md](./architecture.md) | 전체 구조 · 기술 스택 · 현재 구현 현황 |
| [infra.md](./infra.md) | 인프라 설계 상세 |
| [powersync.md](./powersync.md) | PowerSync 통합 가이드 (MongoDB 포함) |
| [backend-implementation.md](./backend-implementation.md) | Spring Boot 구현 상세 |
| [doppler-setup.md](./doppler-setup.md) | 환경변수 관리 |
