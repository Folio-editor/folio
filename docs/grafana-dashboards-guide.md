# Folio Grafana 대시보드 가이드

`folio-editor.co.kr/grafana/dashboards` 에서 볼 수 있는 6개 대시보드의 의미와 읽는 법.

데이터 소스
- **Prometheus**: 메트릭 (HTTP 요청 수, 지연시간, JVM/Mongo/Postgres 내부 카운터)
- **Loki**: 컨테이너 로그
- **Exporters**: cAdvisor (컨테이너), node_exporter (호스트), postgres_exporter, mongodb_exporter, redis_exporter, micrometer (Spring Boot)

---

## 1. Folio · FastAPI (AI Server)

AI 서버(FastAPI) 단일 서비스의 트래픽/지연/에러를 본다.

| 패널 | 의미 | 정상 / 이상 |
|---|---|---|
| Requests / sec | 초당 요청 수 | 트래픽 추이 — 갑작스런 0 = 서버 다운, 급증 = 어뷰징 의심 |
| Latency p50 / p95 / p99 | 응답시간 분포 | p95가 평소 대비 2~3배 → LLM 호출 지연 또는 DB 락 |
| Top endpoints | 호출 많은 라우트 | `/v1/review` 등이 상위 — 비용 큰 엔드포인트가 1위면 캐시/큐 검토 |
| 5xx error rate | 5xx 비율 | 0.5% 이상 지속 → 즉시 로그 확인 |

**우선 볼 것**: p95 latency + 5xx rate. 둘 중 하나만 튀어도 사용자 체감 장애.

---

## 2. Folio · Operations Health

호스트 + 컨테이너 + 백엔드 헬스를 한 화면에. 운영자가 가장 먼저 여는 대시보드.

| 패널 | 의미 | 임계 |
|---|---|---|
| Host CPU | EC2 CPU 사용률 | 80% 지속 → 스케일업 검토 |
| Host Memory | 메모리 사용률 | 90% 지속 → OOM 위험 |
| Host Disk | 디스크 사용률 | 80% 경고, 90% 위험 (Postgres WAL/Mongo oplog 폭주 가능) |
| 활성 컨테이너 수 | running 상태 컨테이너 카운트 | 갑자기 줄면 컨테이너 죽음 |
| Spring Boot 5xx rate | 백엔드 에러율 | 0.5% 이상 지속 → 알람 |
| Spring Boot p95 | 백엔드 응답시간 | 평소 대비 2배 |
| Loki ERROR logs | 최근 에러 로그 카운트 | 급증 = 사고 |

**우선 볼 것**: 호스트 자원 + 5xx rate. 인프라/서비스 이상 빠르게 분리.

---

## 3. Folio · PostgreSQL & Redis

데이터 계층(원고 메타 + 캐시) 상태.

### Postgres
| 패널 | 의미 |
|---|---|
| Active connections | 현재 커넥션 수 — HikariCP 풀 한도 근처면 풀 고갈 |
| DB size | 데이터 증가 추이 |
| Locks waiting | 락 대기 — 0이 정상, 1 이상 지속이면 long-running 트랜잭션 의심 |
| Commits / sec | 쓰기 트래픽 |
| Cache hit ratio | 99% 이상 정상, 떨어지면 메모리 부족 |

### Redis
| 패널 | 의미 |
|---|---|
| Memory usage | maxmemory 대비 사용률 |
| Evictions / sec | 0 정상 — 0 초과면 maxmemory 부족 (캐시 미스 증가) |
| Connected clients | 비정상적으로 늘면 커넥션 누수 |

---

## 4. Folio · PowerSync / MongoDB

문서/실시간 동기화 계층.

| 패널 | 의미 | 임계 |
|---|---|---|
| Storage size | Mongo 데이터 크기 | 증가 추이 모니터링 |
| Oplog window | replay 가능 시간(시간 단위) | 24h 이하면 위험 — 동기화 끊긴 클라이언트 복구 불가 |
| PS ↔ Mongo connections | PowerSync가 Mongo로 연 커넥션 | 0이면 PowerSync 죽음 |
| Global lock queue | Mongo 글로벌 락 대기 | 0이 정상, 1 이상 지속 = write 폭주 |
| Op counters (insert/update/delete/query) | 작업 종류별 처리량 | 트래픽 패턴 파악용 |

**우선 볼 것**: Oplog window. 짧으면 동기화 사고로 직결.

---

## 5. Folio · Spring Boot / JVM

백엔드 JVM 내부.

| 패널 | 의미 | 임계 |
|---|---|---|
| G1 heap used | 힙 사용량 | 한계 직전이면 GC 폭주 |
| GC pause time | GC 멈춤 시간 | p99 200ms 이상이면 응답시간 영향 |
| HikariCP active / idle / pending | 커넥션 풀 상태 | pending > 0 지속 = 풀 고갈 |
| Tomcat threads (busy / max) | HTTP 워커 스레드 | busy = max 이면 대기 발생 |
| HTTP server requests p95 | 엔드포인트별 p95 | Operations Health와 교차 확인 |

**우선 볼 것**: HikariCP pending + Tomcat busy threads. 둘 다 풀 고갈 신호.

---

## 6. Folio 운영 현황

비즈니스 + 운영 종합 뷰. 이슈 발생 시 한눈에 보고용.

| 패널 | 의미 |
|---|---|
| 최근 1h 에러 수 | 최근 한 시간 ERROR 로그 총합 |
| 최근 1h 5xx 수 | 백엔드 5xx 응답 총합 |
| 활성 배포 색상 | Blue/Green 중 현재 활성 — 배포 직후 확인 |
| 실시간 에러 로그 | Loki 실시간 ERROR 스트림 |
| 서비스별 로그 볼륨 | spring/fastapi/powersync 로그 분포 |
| 상태 코드 분포 | 2xx/3xx/4xx/5xx 비율 |
| 결제/구독 이벤트 | Toss webhook 처리 카운트 |
| Celery (있다면) | 백그라운드 작업 큐 처리량 |

**우선 볼 것**: 배포 직후 색상 확인 + 5xx 추이.

---

## 빠르게 보는 우선순위

장애 의심 시 **위에서 아래로** 훑는다.

1. **운영 현황** — 에러/5xx 급증 여부, 활성 색상 확인
2. **Operations Health** — 호스트 자원 + 백엔드 헬스
3. 의심 계층으로 드릴다운:
   - 응답 느림 → **Spring Boot/JVM** (HikariCP, Tomcat)
   - DB 의심 → **Postgres & Redis** (lock, connections)
   - 동기화 의심 → **PowerSync/MongoDB** (oplog window)
   - AI 응답 이상 → **FastAPI**

---

## 현재 No data 항목 정리

다음 패널은 메트릭이 안 들어오고 있어 exporter/쿼리 점검 필요.

- **활성 컨테이너 수** (Operations Health) — cAdvisor 라벨 매칭 확인
- **Oplog Window** (PowerSync/MongoDB) — mongodb_exporter `--collect.replicasetstatus` 활성 여부
- **PowerSync 컨테이너 메트릭** — PowerSync는 자체 `/metrics` 노출 필요, scrape 설정 확인
- **Tomcat 스레드** (Spring Boot/JVM) — micrometer `tomcat.threads.*` 메트릭 활성화 (`management.metrics.enable.tomcat=true`)
- **결제/구독 이벤트** (운영 현황) — Toss webhook 처리 시 커스텀 카운터 발행 필요
- **Celery** (운영 현황) — celery-exporter 미배포 시 패널 제거하거나 배포
- **실시간 에러 로그** (운영 현황) — Loki 라벨/쿼리 일치 여부 확인 (`{level="ERROR"}` 등)
