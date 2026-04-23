# Folio 동기화 파이프라인 점검 및 최적화 분석

## Context

Folio는 오프라인-퍼스트 데스크탑 앱(Electron)으로, 클라이언트 SQLite → PowerSync → Spring Boot → PostgreSQL 파이프라인을 사용한다. 서비스 출시 전 트래픽/부하/용량 관점에서 잠재적 문제를 사전에 도출하고 최적화 방향을 정리한다.

---

## 1. 현재 아키텍처 요약

```
[Electron App]
  └─ SQLite (wa-sqlite/OPFS) ──local write──→ ps_crud queue
       ↕ useQuery (reactive)        │
  └─ PowerSync SDK ←───────────────→ PowerSync Service (port 8090)
       │  WebSocket (실시간)              │
       │                                  ├─ MongoDB (버킷 메타데이터)
       │                                  └─ PostgreSQL (WAL logical replication)
       │
       └─ uploadData() ──POST──→ Spring Boot /api/v1/sync/upload
                                     └─ JPA → PostgreSQL (12 sync tables)
                                     └─ EpisodeIndexDebouncer → AI 서버
```

**핵심 파일:**
- Frontend connector: `frontend/src/renderer/sync/connector.ts`
- Frontend DB: `frontend/src/renderer/sync/db.ts`
- Local writes: `frontend/src/shared/hooks/useLocalWrite.ts`
- Sync rules: `infra/powersync/sync-rules.yaml`
- Backend sync: `backend/src/.../sync/service/SyncService.java`
- Backend sync controller: `backend/src/.../sync/controller/SyncController.java`
- Docker prod: `infra/prod/docker-compose.yml`

---

## 2. 문제점 분석

### 2.1 오프라인 작업 큐 무한 증가

**현상:** 오프라인 상태에서 모든 로컬 쓰기가 `ps_crud` 큐에 무한 누적된다.

**위험:**
- 장기 오프라인(수일~수주) 시 SQLite 파일 크기 급증
- 재접속 시 대량 CRUD 일괄 업로드 → 백엔드에 burst 부하
- `uploadData()`가 `getNextCrudTransaction()` 루프로 하나씩 순차 전송 → 수천 건이면 수분~수십분 소요

**영향도:** 높음 (데이터 유실 가능성은 낮으나, UX 및 서버 부하 심각)

**개선 방안:**
- [ ] 큐 깊이 모니터링 UI 추가 (현재 SyncStatusBar는 상태만 표시, 대기 건수 미표시)
- [ ] 재접속 시 업로드 속도 조절 (throttle): 예) 100건 업로드 후 500ms 대기
- [ ] 큐 크기 임계값 경고 (예: 1000건 초과 시 "동기화 지연" 알림)
- [ ] 오프라인 기간 상한 가이드라인 문서화

### 2.2 실시간 동기화로 인한 서버 부하

**현상:** 에디터 콘텐츠 변경이 1초 디바운스 후 SQLite write → 즉시 CRUD 큐 → PowerSync가 즉시 업로드 시도

**시나리오 계산 (동시 사용자 1,000명 기준):**
- 활발한 작성자: 분당 ~20회 콘텐츠 저장 (1초 디바운스 × 타이핑 패턴)
- 1,000명 × 20 req/min = **~333 req/sec** sync upload
- 각 요청이 JPA 트랜잭션 → DB connection pool 점유

**위험:**
- HikariCP pool 20개로는 333 req/sec 처리 불가 → connection timeout
- PostgreSQL max_connections 기본값(100)에 빠르게 도달
- PowerSync Service가 동시에 WAL replication도 처리 → 이중 부하

**영향도:** 매우 높음

**개선 방안:**
- [ ] 에디터 디바운스를 1초 → 3~5초로 상향 (체감 차이 미미)
- [ ] `uploadData()`에서 여러 트랜잭션을 하나의 HTTP 배치로 묶기 (현재는 트랜잭션당 1 POST)
- [ ] HikariCP pool size 환경변수화 및 프로덕션 기본값 상향 (20 → 50)
- [ ] PostgreSQL `max_connections` 200 이상으로 설정
- [ ] 읽기 전용 replica 분리 고려 (PowerSync WAL은 replica에서 구독)

### 2.3 Sync Upload 요청 크기 제한 없음

**현상:** `/api/v1/sync/upload`가 `List<SyncUploadRequest>` 바디를 크기 제한 없이 수신

**위험:**
- 대량 오프라인 큐 플러시 시 단일 요청에 수천 건 포함 가능
- Spring Boot 기본 요청 크기 ~10MB, 하지만 episode content에 대용량 JSON 포함 시 초과 가능
- `@Transactional` 전체 배치 → 하나 실패 시 전부 롤백 → 재시도 무한 루프 가능

**영향도:** 높음

**개선 방안:**
- [ ] 프론트엔드 `uploadData()`에서 배치 크기 제한 (예: 50건씩 분할 전송)
- [ ] Spring Boot에 `spring.servlet.multipart.max-request-size` 명시적 설정
- [ ] 실패한 개별 항목을 격리하고 나머지 진행하는 partial-success 전략 검토

### 2.4 에디터 콘텐츠 크기 무제한

**현상:** episode/plan/note content가 TipTap JSON으로 저장되며 크기 제한 없음

**위험:**
- 장편 소설 1회차 = 수만 자 → JSON으로 수백 KB
- 수정할 때마다 전체 JSON이 CRUD 큐에 들어감 (diff가 아닌 full replace)
- 1,000명이 각 10회차 × 100KB = **~1GB/일** 동기화 트래픽
- Base64 프로필 이미지가 DB에 직접 저장 (300×300 WebP ≈ 20~50KB/개)

**영향도:** 중간~높음

**개선 방안:**
- [ ] 콘텐츠 크기 상한 설정 (예: episode당 500KB 소프트 리밋)
- [ ] 프로필 이미지를 외부 스토리지(S3/R2)로 분리, URL만 DB에 저장
- [ ] 장기적으로 Y.js 등 CRDT 기반 delta sync 검토 (전체 교체가 아닌 변경분만 동기화)

### 2.5 MongoDB 단일 노드 장애 취약

**현상:** PowerSync 버킷 메타데이터를 단일 노드 MongoDB replica set에 저장

**위험:**
- 노드 장애 시 PowerSync 서비스 전체 불능
- 복구 시간 동안 모든 클라이언트 동기화 중단 (오프라인 모드는 유지)
- WiredTiger 캐시 0.5GB로 제한 → 사용자 증가 시 성능 저하

**영향도:** 중간

**개선 방안:**
- [ ] MongoDB 3-node replica set 구성 (최소 HA)
- [ ] WiredTiger 캐시 사이즈를 사용자 규모에 따라 조정 (사용자 10K 이상 시 2GB+)
- [ ] MongoDB 모니터링 (Atlas 또는 Prometheus exporter)

### 2.6 PostgreSQL 리소스 설정

**현재 프로덕션 설정:**
- `shared_buffers=512MB`
- `effective_cache_size=1536MB`
- `max_replication_slots=4`
- `max_wal_senders=4`

**위험:**
- WAL 생성량이 replication 소비량을 초과하면 WAL 파일 디스크 점유 급증
- `max_wal_senders=4`는 PowerSync + 모니터링 + 백업을 동시 운영하기에 부족할 수 있음
- 인덱스 없는 쿼리가 있을 경우 풀스캔 → connection pool 점유 장기화

**개선 방안:**
- [ ] `max_wal_senders` 8 이상으로 상향
- [ ] `wal_keep_size` 또는 replication slot 모니터링 설정
- [ ] `pg_stat_statements` 활성화하여 슬로우 쿼리 추적
- [ ] connection pool 모니터링 (HikariCP metrics → Prometheus)

### 2.7 Redis 메모리 제한

**현재:** `--maxmemory 256mb --maxmemory-policy allkeys-lru`

**위험:**
- refresh token 저장: `RT:{writer_id}:{device_id}` 패턴
- 사용자 10,000명 × 디바이스 2개 = 20,000 키 → 약 20~40MB (여유 있음)
- 하지만 추가 캐시 용도 확장 시 빠르게 소진 가능
- `allkeys-lru` 정책으로 중요한 token도 eviction 대상

**개선 방안:**
- [ ] refresh token에 `volatile-lru` 또는 별도 Redis 인스턴스 사용 고려
- [ ] 현재 256MB는 token 전용이면 충분하나, 캐시 확장 시 재검토

### 2.8 동시 편집 충돌 (멀티 디바이스)

**현상:** 같은 사용자가 2개 기기에서 동일 episode를 오프라인으로 수정 후 동시 접속

**위험:**
- Last-write-wins → 먼저 도착한 변경이 덮어씌워짐
- 사용자에게 충돌 알림 없음
- 소설 원고 데이터 특성상 내용 손실이 치명적

**영향도:** 높음 (하지만 단일 기기 사용이 주 시나리오이면 낮음)

**개선 방안:**
- [ ] `updated_at` 기반 낙관적 잠금: 서버에서 version mismatch 감지 → 409 반환
- [ ] 충돌 시 양쪽 버전 보존하여 사용자가 선택하는 UI
- [ ] 단기적으로: 동일 문서 동시 수정 시 경고 메시지 표시

### 2.9 게스트 모드 데이터 유실 위험

**현상:** 로그인 없이 작성한 데이터는 로컬 SQLite에만 존재

**위험:**
- 앱 재설치, 캐시 클리어, OPFS 초기화 → 전체 데이터 영구 손실
- 백업/내보내기 기능 없음

**개선 방안:**
- [ ] 게스트 모드에서 주기적 로그인 유도 배너
- [ ] 로컬 백업 내보내기(JSON/ZIP) 기능 구현
- [ ] 게스트 데이터 양 임계값(예: episode 5개) 초과 시 로그인 강제

### 2.10 AI 인덱싱 내구성 부족

**현상:** `EpisodeIndexDebouncer`가 인메모리 `ScheduledExecutorService` 사용

**위험:**
- 서버 재시작/크래시 시 디바운스 중이던 인덱싱 작업 유실
- 해당 episode의 AI 임베딩이 갱신되지 않음
- 별도 복구 메커니즘 없음

**개선 방안:**
- [ ] DB 기반 작업 큐 도입 (예: `pending_index` 테이블 + 스케줄러)
- [ ] 서버 시작 시 미처리 episode 스캔 후 일괄 인덱싱

### 2.11 Nginx 프록시 설정

**현재:**
- WebSocket(PowerSync): `proxy_read_timeout: 86400s` (24시간)
- API: `proxy_read_timeout: 60s`
- `client_max_body_size: 20M`
- `worker_connections: 1024`

**위험:**
- WebSocket 24시간 타임아웃 → 유휴 연결이 worker 점유
- `worker_connections 1024` → 동시 사용자 ~500명에서 포화 (WebSocket + API)
- 20MB 업로드 제한은 일반 sync에 충분하지만 명시적 validation 없음

**개선 방안:**
- [ ] `worker_connections` 4096 이상으로 상향
- [ ] WebSocket idle timeout을 적절히 조정 (예: 3600s) + 클라이언트 재연결 로직 확인
- [ ] `worker_processes auto` 확인 (CPU 코어 수 자동 감지)

---

## 3. 우선순위별 정리

### P0 - 출시 전 필수
| 항목 | 이유 |
|------|------|
| 2.2 에디터 디바운스 상향 (1s→3~5s) | 서버 부하 60~80% 감소, 변경 최소 |
| 2.3 업로드 배치 크기 제한 | 대량 큐 플러시 시 서버 다운 방지 |
| 2.6 PostgreSQL max_wal_senders 상향 | 운영 안정성 |
| 2.11 Nginx worker_connections 상향 | 동시접속 병목 해소 |

### P1 - 출시 초기 대응
| 항목 | 이유 |
|------|------|
| 2.1 오프라인 큐 모니터링 UI | UX 개선, 지원 문의 감소 |
| 2.2 HikariCP pool size 상향 | connection 고갈 방지 |
| 2.4 프로필 이미지 외부 스토리지 분리 | DB 비대화 방지 |
| 2.9 게스트 데이터 백업 기능 | 데이터 유실 방지 |
| 2.10 AI 인덱싱 내구성 | 임베딩 정합성 보장 |

### P2 - 스케일 단계
| 항목 | 이유 |
|------|------|
| 2.5 MongoDB HA 구성 | 장애 대응 |
| 2.8 충돌 감지/해결 UI | 멀티 디바이스 지원 |
| 2.4 CRDT 기반 delta sync | 트래픽 근본 해결 |
| 2.2 읽기 전용 replica 분리 | 대규모 확장 |

---

## 4. 트래픽 시뮬레이션 (예상치)

| 규모 | 동시 활성 | sync req/sec | DB conn 필요 | 일일 WAL 생성량 |
|------|----------|-------------|-------------|---------------|
| 베타 100명 | 30명 | ~10 | 15~20 | ~500MB |
| 출시 1,000명 | 300명 | ~100 | 50~80 | ~5GB |
| 성장 10,000명 | 1,000명 | ~333 | 150~200 | ~15GB |
| 대규모 50,000명 | 5,000명 | ~1,600 | 별도 아키텍처 필요 | ~50GB+ |

**현재 인프라 한계:** 동시 활성 ~200~300명 수준 (HikariCP 20, worker_connections 1024 기준)

---

## 5. 검증 방법

- [ ] k6 또는 Artillery로 `/api/v1/sync/upload` 부하 테스트 (100~1000 concurrent)
- [ ] 오프라인 시뮬레이션: 네트워크 차단 → 1시간 작업 → 재연결 후 큐 플러시 시간 측정
- [ ] HikariCP 메트릭 수집: `spring.datasource.hikari.metrics-tracker-factory=prometheus`
- [ ] PostgreSQL `pg_stat_replication` 모니터링으로 WAL lag 확인
- [ ] MongoDB `rs.status()` + WiredTiger cache usage 모니터링
