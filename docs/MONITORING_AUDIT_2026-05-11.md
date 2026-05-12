# Folio 인프라 모니터링 시스템 점검 보고서

- 작성일: **2026-05-11**
- 대상 환경: EC2 prod, `/opt/folio/S14P31F203/infra/prod`
- 현재 활성 색상: `green` (`/opt/folio/active-color`)
- 작성 위치: `/opt/folio/MONITORING_AUDIT_2026-05-11.md` (git 추적 외부, 운영 작업 디렉토리)
- 본 보고서는 **현 상태 진단 + 보강 권고**만 담는다. 코드/설정 변경은 사용자가 로컬에서 작업한 뒤 CI/CD 블루그린 재배포로 반영한다.

---

## 1. Executive Summary

1. 모니터링 백본(Prometheus 2.55 / Grafana 11.6 / Loki 3.4 / Promtail 3.4)은 **base compose에 단일 인스턴스**로 배치되어 블루그린 swap에 영향을 받지 않는다. 데이터 볼륨도 `/opt/folio/data/{prometheus,loki,grafana,promtail-positions}`로 영속화돼 있어 색상 전환 후에도 메트릭/로그 연속성이 보장된다.
2. **앱 메트릭 노출은 정상**: Spring Boot(`/actuator/prometheus` + histogram 분포 활성), FastAPI(`/metrics` + X-Internal-Api-Key 인증), DB 3종 익스포터(postgres/redis/mongodb) 모두 설치·스크레이프 정상.
3. **블루그린 색상 라벨링은 절반만 동작**: Prometheus·Promtail은 컨테이너명 정규식으로 `color` 라벨을 잘 추출하지만, **cAdvisor 메트릭(`container_*`)에는 `color`/`service` 라벨이 전혀 안 붙어** 색상별 컨테이너 리소스 비교 불가능. (compose의 `labels:` 누락이 원인)
4. **즉시 보강 필요 항목 5건(P0)**: cAdvisor 라벨 누락, NGINX 익스포터 부재, Vault 익스포터 부재, Celery 워커 메트릭 부재, 알림 룰 전면 미구성.
5. **가시성 확장 권고 6건(P1)**: 대시보드 `$color` 변수화(FastAPI/Spring), LLM 비용 메트릭, 비즈니스(결제·구독) 메트릭, Postgres slow-query 패널, Mongo oplog 알람화, PowerSync 앱 메트릭.

**블루그린 호환성 점수: 8 / 12 PASS** (자세한 표는 §4 참조)

---

## 2. 현 모니터링 스택 인벤토리

### 2.1 컨테이너 (base compose: `infra/prod/docker-compose.yml`)

| 분류 | 컨테이너 | 이미지 | 내부 포트 | 노출 메트릭 | 비고 |
|---|---|---|---|---|---|
| 메트릭 DB | folio-prometheus | prom/prometheus:v2.55.0 | 9090 | `/metrics` | retention 15d, `--web.enable-lifecycle` ON |
| 메트릭 익스포터 | folio-node-exporter | prom/node-exporter:v1.8.2 | 9100 | 호스트 OS | 정상 |
| 메트릭 익스포터 | folio-cadvisor | gcr.io/cadvisor/cadvisor:v0.49.1 | 8080 | 컨테이너 리소스 | 라벨 화이트리스트 설정됐으나 컨테이너에 라벨 없음 (P0-1) |
| 메트릭 익스포터 | folio-postgres-exporter | prometheuscommunity/postgres-exporter:v0.17.1 | 9187 | PG17 호환 | custom queries 없음 |
| 메트릭 익스포터 | folio-redis-exporter | oliver006/redis_exporter:v1.62.0 | 9121 | 정상 | |
| 메트릭 익스포터 | folio-mongodb-exporter | percona/mongodb_exporter:0.41.2 | 9216 | `--collect-all` | rs0 |
| 메트릭 익스포터 | (없음) | nginx-prometheus-exporter | — | — | **부재 (P0-2)** |
| 메트릭 익스포터 | (없음) | celery-exporter | — | — | **부재 (P0-4)** |
| 메트릭 익스포터 | (없음) | Vault telemetry | — | — | **부재 (P0-5)** |
| 로그 수집 | folio-promtail | grafana/promtail:3.4 | 9080 | docker SD | JSON 파싱·헬스 필터·민감정보 마스킹 모두 정상 |
| 로그 저장 | folio-loki | grafana/loki:3.4 | 3100 | retention 7d | max_line_size 8KB (P2-2) |
| 가시화 | folio-grafana | grafana/grafana:11.6.0 | 3000 | `/grafana/api/health` | unified alerting ON, 룰 0건 (P0-3) |
| 리버스 프록시 | folio-nginx | nginx:1.30-alpine | 80/443 | (stub_status 없음) | JSON access log → Loki |
| 시크릿 | folio-vault-prod | hashicorp/vault:1.15 | 8200 | (telemetry 없음) | backend 기동 전 unseal 필수 |
| 앱 | folio-{backend,ai,celery-worker,web,landing}-{blue,green} | (자체 빌드) | 8080/8000/80 | actuator·/metrics | swap 대상 |

### 2.2 Prometheus 스크레이프 잡 (현재 9개)

| job_name | 방식 | 대상 | scrape interval | 라벨 부착 |
|---|---|---|---|---|
| prometheus | static | localhost:9090 | 30s | — |
| node-exporter | static | node-exporter:9100 | 15s | — |
| cadvisor | static | cadvisor:8080 | 30s | (컨테이너 라벨 자동) |
| spring-boot | **docker_sd** + relabel | `folio-backend-(blue\|green)`:8080 `/actuator/prometheus` | 15s | `service=backend`, `color={blue,green}` |
| fastapi | **docker_sd** + relabel | `folio-ai-(blue\|green)`:8000 `/metrics` | 15s | `service=ai`, `color={blue,green}` |
| postgres | static | postgres-exporter:9187 | 30s | `service=postgresql` |
| redis | static | redis-exporter:9121 | 30s | `service=redis` |
| mongodb | static | mongodb-exporter:9216 | 30s | `service=mongo` |

**docker_sd_configs refresh_interval = 30s** (P2-1에서 거론). 외부 라벨 `environment=production`, `project=folio` 전역 부착.

### 2.3 Grafana 대시보드 (현재 6개)

| 파일명 | 제목 | UID | 패널 수 | 색상 변수 |
|---|---|---|---|---|
| folio-operations-overview.json | Folio 운영 현황 | ffk25vjpdq5mof | 8 | 없음 (panel 1에 color=~"blue\|green" 하드코딩) |
| folio-operations-health.json | Folio · Operations Health | folio-ops-health | 7 | **`$color` 있음** (모범) |
| folio-fastapi.json | Folio · FastAPI (AI Server) | folio-fastapi | 4 | 없음 (panel 1만 by(color)) |
| folio-spring-jvm.json | Folio · Spring Boot / JVM | folio-spring-jvm | 5 | 없음 (legend `{{color}}`만, 쿼리는 무시) |
| folio-db-redis.json | Folio · PostgreSQL & Redis | folio-db-redis | 6 | 해당 없음 (공유 인프라) |
| folio-powersync-mongo.json | Folio · PowerSync / MongoDB | folio-powersync-mongo | 6 | 해당 없음 (공유 인프라) |

---

## 3. 대시보드 ↔ 메트릭 매핑 현황

각 대시보드 쿼리가 의존하는 메트릭/익스포터/`color` 라벨 정합성:

| 대시보드 패널 | 메트릭 셀렉터 | 출처 익스포터 | color 라벨 동작? |
|---|---|---|---|
| Ops Overview · 활성 색상 | `up{job=~"spring-boot\|fastapi",color=~"blue\|green"}` | Prometheus self | ✅ relabel로 부착됨 |
| Ops Overview · HTTP 상태 분포 | `http_server_requests_seconds_count{service="backend"}` | Spring micrometer | ✅ (단, 쿼리에 `color` 분리 안 함) |
| Ops Overview · HTTP 5xx 1h | `http_server_requests_seconds_count{...status=~"5.."}` | Spring micrometer | ⚠️ 색상 합산값만 노출 |
| Ops Health · CPU/Mem/Disk | `node_*` | node-exporter | n/a |
| Ops Health · 활성 컨테이너 수 | `container_last_seen{name=~"folio-.*"}` | cAdvisor | ⚠️ name 라벨만 사용 — color 라벨 없음 |
| Ops Health · HTTP 5xx / p95 | `http_server_requests_seconds_*{...color=~"$color"}` | Spring micrometer | ✅ 정상 |
| FastAPI · 요청율 | `http_requests_total{service="ai"}` | prometheus-fastapi-instrumentator | ✅ relabel로 부착됨 (쿼리는 by(color) 사용) |
| FastAPI · p50/p95/p99 | `http_request_duration_seconds_bucket{service="ai"}` | 동상 | ⚠️ 쿼리에 by(color) 없음 |
| FastAPI · Top 10 handler | `http_requests_total{service="ai"}` by(handler) | 동상 | ✅ handler 라벨 정상 |
| FastAPI · 5xx 비율 | `...{status=~"5.."}` / total | 동상 | ⚠️ 색상 합산 |
| Spring JVM · Heap | `jvm_memory_used_bytes{service="backend",area="heap"}` | Spring micrometer | ✅ 라벨 있음, 쿼리 by 누락 |
| Spring JVM · GC pause | `jvm_gc_pause_seconds_sum{service="backend"}` | 동상 | 동상 |
| Spring JVM · HikariCP active/pending | `hikaricp_connections_*{service="backend"}` | 동상 | 동상 |
| Spring JVM · Tomcat busy | `tomcat_threads_busy_threads{service="backend"}` | 동상 | 동상 |
| Spring JVM · latency p50/p95/p99 | `http_server_requests_seconds_bucket{service="backend"}` | 동상 | 동상 |
| DB/Redis · PG 모든 패널 | `pg_*` | postgres-exporter | n/a |
| DB/Redis · Redis 모든 패널 | `redis_*` | redis-exporter | n/a |
| Mongo · 모든 패널 | `mongodb_*` | mongodb-exporter | n/a |
| Mongo · PowerSync 컨테이너 | `container_*{name="folio-powersync-prod"}` | cAdvisor | ✅ name 하드코딩이라 OK (base 서비스, swap 없음) |

**요약**:
- `service`/`color` 라벨이 메트릭 단에서는 잘 부착되지만 **대시보드 쿼리가 이를 활용하지 않는 경우가 많다**.
- cAdvisor 기반 패널(`container_*`)은 라벨 누락(§5 P0-1)으로 색상별 비교가 원천 불가능.

---

## 4. 블루그린 호환성 점검표

| # | 점검 항목 | 결과 | 비고 |
|---|---|---|---|
| 1 | 모니터링 스택이 base compose에 단일 인스턴스 | ✅ PASS | loki/promtail/prometheus/grafana 전부 base에 위치 |
| 2 | 모니터링 데이터 영속 볼륨 | ✅ PASS | `/opt/folio/data/*` 호스트 마운트, swap 무영향 |
| 3 | 앱 컨테이너 색상별 자동 발견 | ✅ PASS | Prometheus & Promtail docker_sd_configs |
| 4 | 컨테이너명에서 `color` 라벨 추출 | ✅ PASS | relabel rule 양쪽 모두 동작 |
| 5 | docker_sd refresh 간격 정합성 | ⚠️ PARTIAL | Promtail 5s vs Prometheus 30s — swap 직후 25초 patchy |
| 6 | 데이터소스 UID가 안정적 | ✅ PASS | `prometheus`, `loki` 고정 |
| 7 | Grafana 프로비저닝 declarative | ✅ PASS | datasource·dashboard 자동 |
| 8 | cAdvisor 컨테이너 라벨이 메트릭에 부착 | ❌ **FAIL** | compose에 `labels:` 누락 (§5 B-1) |
| 9 | swap 도중 알람 false positive 방지 | ⚠️ N/A | 알람 룰이 0건이라 영향 없음 (역설적 PASS) |
| 10 | nginx upstream 전환 후 메트릭 갱신 | ⚠️ PARTIAL | nginx 메트릭 자체가 없음 (§5 B-2) |
| 11 | 헬스체크 실패시 자동 롤백 | ✅ PASS | deploy.sh:127-134 |
| 12 | active-color 상태 원자 갱신 | ✅ PASS | deploy.sh:145 (nginx reload 직후) |

**총평**: 데이터/디스커버리 측면은 견고하나 **컨테이너 리소스 가시성과 알림은 사실상 비어있다**.

---

## 5. P0 — 즉시 수정 (블루그린/메트릭 정합성 결함)

### B-1. cAdvisor 라벨이 컨테이너에 부착되지 않음 🔴 (최우선)

**증상 / 영향**
- cAdvisor 옵션은 `service`/`color`/`environment` 라벨 화이트리스트를 명시했는데 정작 앱 컨테이너에 해당 라벨이 정의돼 있지 않아, `container_cpu_usage_seconds_total{color="green"}` 같은 쿼리가 **항상 빈 결과**를 반환한다.
- 색상별 CPU/메모리/네트워크 비교, 카나리 카나리 디버깅 불가.

**근거**
- [docker-compose.yml:289-314](infra/prod/docker-compose.yml) — `--whitelisted_container_labels=color,service,environment` 선언.
- `grep -nE "labels:|service:|color:" infra/prod/docker-compose.{blue,green}.yml` → **0건** (라벨 블록 자체가 없음).

**권고 변경 (compose 패치)**
`docker-compose.blue.yml`, `docker-compose.green.yml` 모든 앱 서비스에 `labels:` 추가. 예시 (blue):

```yaml
services:
  spring-boot-blue:
    container_name: folio-backend-blue
    image: folio-backend:${IMAGE_TAG}
    # ... 기존 설정 유지 ...
    labels:
      service: backend
      color: blue
      environment: production

  fastapi-blue:
    container_name: folio-ai-blue
    labels:
      service: ai
      color: blue
      environment: production

  celery-worker-blue:
    container_name: folio-celery-worker-blue
    labels:
      service: celery-worker
      color: blue
      environment: production

  react-web-blue:
    container_name: folio-web-blue
    labels:
      service: web
      color: blue
      environment: production

  landing-blue:
    container_name: folio-landing-blue
    labels:
      service: landing
      color: blue
      environment: production
```

`docker-compose.green.yml`는 `color: green`으로 동일하게 작성.

**(권고 D-6 함께 적용)** base compose의 공유 서비스에도 `service` 라벨 부여 권장:

```yaml
services:
  nginx:        { labels: { service: nginx,      environment: production } }
  postgresql:   { labels: { service: postgresql, environment: production } }
  redis:        { labels: { service: redis,      environment: production } }
  mongo:        { labels: { service: mongo,      environment: production } }
  powersync:    { labels: { service: powersync,  environment: production } }
  vault:        { labels: { service: vault,      environment: production } }
```

**블루그린 호환성 영향**: 라벨은 compose에 정의되어 swap 시점 자동 적용. Prometheus/Promtail의 기존 라벨 추출 로직과 충돌 없음(둘 다 별도 경로로 동일 라벨 만들어내고 있어, cAdvisor 쪽은 추가로 채워지는 효과).

**검증**:
```bash
docker inspect folio-backend-green --format '{{json .Config.Labels}}'
curl -s 'http://localhost:9090/api/v1/query?query=container_cpu_usage_seconds_total{color="green"}' | jq '.data.result | length'  # >0 여야 함
```

---

### B-2. NGINX 메트릭 익스포터 부재 🔴

**증상 / 영향**
- nginx 요청 총량, 활성 연결 수, 업스트림 응답시간을 Prometheus에서 볼 수 없다. 현재 모든 nginx 운영 가시성은 Loki 로그(`{service="nginx"}`) 한 곳에만 의존.
- 결과: 단순 RPS 비교, 5xx 비율(메트릭) 알람, 업스트림(blue/green) 응답시간 비교 전부 불가.

**근거**
- `infra/prod/nginx/nginx.conf`에 `stub_status` 디렉티브 없음.
- `infra/prod/docker-compose.yml`에 nginx-exporter 서비스 없음.

**권고 변경**

(1) `nginx/nginx.conf`의 `http {}` 블록 안 적당한 위치에 status 서버 추가:

```nginx
# Prometheus stub_status — internal only
server {
    listen 8888;
    server_name _;
    access_log off;
    location /nginx_status {
        stub_status;
        allow 172.16.0.0/12;   # docker bridge 대역
        deny all;
    }
}
```

(2) base compose에 익스포터 추가:

```yaml
nginx-exporter:
  image: nginx/nginx-prometheus-exporter:1.3.0
  container_name: folio-nginx-exporter
  restart: always
  command:
    - '-nginx.scrape-uri=http://nginx:8888/nginx_status'
  depends_on:
    nginx: { condition: service_healthy }
  networks: [folio-net]
  labels:
    service: nginx-exporter
    environment: production
```

(3) `prometheus.yml`에 잡 추가:

```yaml
  - job_name: nginx
    scrape_interval: 15s
    static_configs:
      - targets: ['nginx-exporter:9113']
        labels: { service: nginx }
```

(4) **신규 대시보드 `folio-nginx.json`** — 패널 4종:
- 활성 연결 수: `nginx_connections_active`
- 초당 요청 (accepts/handled/request 차분): `rate(nginx_http_requests_total[5m])`
- 5xx 비율(Loki): `sum(count_over_time({service="nginx"} |~ "\"status\":\"5..\""[5m])) / sum(count_over_time({service="nginx"}[5m]))`
- 업스트림 응답시간 p95(Loki, request_time/upstream_response_time 필드): LogQL `quantile_over_time(0.95, {service="nginx"} | json | unwrap upstream_response_time [5m])`

**블루그린 호환성**: nginx 자체는 base. 익스포터도 base. swap과 무관. 단, 5xx/지연이 swap 직후 spike 가능 — 향후 P1-1 알람에서 `for 5m`로 노이즈 흡수.

---

### B-3. 알림(Alerting) 규칙 전면 미구성 🔴

**증상 / 영향**
- Grafana는 `GF_UNIFIED_ALERTING_ENABLED=true`(docker-compose.yml grafana 환경변수)인데 `grafana/provisioning/alerting/` 디렉토리가 통째로 부재. 룰 0건, contact point 0건.
- 결과: 백엔드 다운, DB 커넥션 고갈, 디스크 임계 등 어떤 사고도 자동 통보 불가.

**근거**
- `find infra/prod/grafana/provisioning -type d` → `dashboards`, `datasources`만 존재.

**권고 변경**

Grafana provisioning에 3 파일 신설:

**A) `infra/prod/grafana/provisioning/alerting/rules.yml`** (룰 본체 초안)

```yaml
apiVersion: 1
groups:
  - orgId: 1
    name: folio-critical
    folder: Folio
    interval: 1m
    rules:
      - uid: folio-app-down
        title: App instance down
        condition: A
        for: 2m
        data:
          - refId: A
            datasourceUid: prometheus
            relativeTimeRange: { from: 120, to: 0 }
            model:
              expr: 'sum by (job, color) (up{job=~"spring-boot|fastapi"}) == 0'
              instant: true
        labels: { severity: critical }
        annotations:
          summary: "{{ $labels.job }}/{{ $labels.color }} 인스턴스 다운"
          runbook: "deploy.sh 헬스체크 + docker logs"

      - uid: folio-http-5xx-spike
        title: HTTP 5xx spike (backend)
        condition: A
        for: 5m
        data:
          - refId: A
            datasourceUid: prometheus
            relativeTimeRange: { from: 300, to: 0 }
            model:
              expr: 'sum(rate(http_server_requests_seconds_count{service="backend",status=~"5.."}[5m])) > 0.1'
              instant: true
        labels: { severity: high }
        annotations:
          summary: "Backend 5xx 비율 임계 초과 (>0.1 req/s)"

      - uid: folio-disk-low
        title: Disk free < 15%
        condition: A
        for: 10m
        data:
          - refId: A
            datasourceUid: prometheus
            relativeTimeRange: { from: 600, to: 0 }
            model:
              expr: 'node_filesystem_avail_bytes{mountpoint="/",fstype!~"tmpfs|overlay"} / node_filesystem_size_bytes{mountpoint="/"} < 0.15'
              instant: true
        labels: { severity: high }
        annotations: { summary: "루트 디스크 잔여 15% 미만" }

      - uid: folio-mem-low
        title: Host memory free < 15%
        condition: A
        for: 5m
        data:
          - refId: A
            datasourceUid: prometheus
            relativeTimeRange: { from: 300, to: 0 }
            model:
              expr: 'node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes < 0.15'
              instant: true
        labels: { severity: high }
        annotations: { summary: "호스트 가용 메모리 15% 미만" }

      - uid: folio-pg-connections-high
        title: Postgres connection pool near max
        condition: A
        for: 5m
        data:
          - refId: A
            datasourceUid: prometheus
            relativeTimeRange: { from: 300, to: 0 }
            model:
              expr: 'sum(pg_stat_activity_count) / pg_settings_max_connections > 0.8'
              instant: true
        labels: { severity: high }
        annotations: { summary: "Postgres 커넥션 80% 초과" }

      - uid: folio-redis-mem-high
        title: Redis memory > 90%
        condition: A
        for: 5m
        data:
          - refId: A
            datasourceUid: prometheus
            relativeTimeRange: { from: 300, to: 0 }
            model:
              expr: 'redis_memory_used_bytes / redis_memory_max_bytes > 0.9'
              instant: true
        labels: { severity: high }
        annotations: { summary: "Redis 메모리 90% 초과 — 키 이빅션 임박" }

      - uid: folio-mongo-oplog-low
        title: Mongo oplog window < 1h
        condition: A
        for: 10m
        data:
          - refId: A
            datasourceUid: prometheus
            relativeTimeRange: { from: 600, to: 0 }
            model:
              expr: 'mongodb_oplog_stats_window_seconds < 3600'
              instant: true
        labels: { severity: medium }
        annotations: { summary: "Oplog 보존 1h 미만 — PowerSync 재동기화 위험" }

      - uid: folio-vault-sealed
        title: Vault sealed
        condition: A
        for: 1m
        data:
          - refId: A
            datasourceUid: prometheus
            relativeTimeRange: { from: 60, to: 0 }
            model:
              expr: 'vault_core_unsealed == 0'
              instant: true
        labels: { severity: critical }
        annotations:
          summary: "Vault sealed — backend 부팅 차단"
          runbook: "bash infra/scripts/vault-unseal.sh --interactive"
```

**B) `infra/prod/grafana/provisioning/alerting/contact-points.yml`** (placeholder, 로컬에서 실제 webhook URL 주입)

```yaml
apiVersion: 1
contactPoints:
  - orgId: 1
    name: folio-default
    receivers:
      - uid: folio-default-receiver
        type: slack          # 또는 email, webhook, discord 등 사용자 결정
        settings:
          url: ${SLACK_WEBHOOK_URL}   # Doppler에서 주입 권장
          title: "[Folio][{{ .Status }}] {{ .Labels.severity }}"
          text: |
            {{ range .Alerts }}
            • {{ .Annotations.summary }}
            color={{ .Labels.color }} job={{ .Labels.job }}
            {{ end }}
```

**C) `infra/prod/grafana/provisioning/alerting/policies.yml`**

```yaml
apiVersion: 1
policies:
  - orgId: 1
    receiver: folio-default
    group_by: [grafana_folder, alertname, severity]
    group_wait: 30s
    group_interval: 5m
    repeat_interval: 4h
    routes:
      - receiver: folio-default
        matchers: ['severity = critical']
        group_wait: 10s
        repeat_interval: 1h
```

그리고 grafana 컨테이너의 볼륨 마운트는 이미 `./grafana/provisioning:/etc/grafana/provisioning:ro`라서 추가 마운트 불필요.

**블루그린 호환성**: 룰은 base의 grafana에 provisioning됨. swap 영향 없음. 단 swap 직후 ~30s 동안 양 색상이 모두 보일 수 있어 `for: 2m+`로 진정구간 확보 (이미 반영).

---

### B-4. Celery 워커 메트릭 부재 🔴

**증상 / 영향**
- celery-worker 컨테이너는 메트릭 엔드포인트를 노출하지 않는다(`ai/app/celery_app.py` 확인). 큐 적체, 작업 실패율, 평균 처리 지연을 메트릭으로 추적 불가 — 운영자는 Loki 로그를 `{service="celery-worker"}`로 grep해 봐야 함.
- 결제 후처리, AI 후속 작업이 Celery 위에 있으면 결제 SLA에 직접 영향.

**근거**
- `pyproject.toml`에 celery prometheus 관련 패키지 없음.
- `prometheus.yml`에 celery 잡 없음.

**권고 변경 (옵션 두 가지)**

**Option A: 사이드카 익스포터 (코드 변경 최소, 권장)**

base compose에 추가:

```yaml
celery-exporter:
  image: danihodovic/celery-exporter:0.10.10
  container_name: folio-celery-exporter
  restart: always
  environment:
    CE_BROKER_URL: ${CELERY_BROKER_URL}   # redis://redis:6379/0
    CE_ACCEPT_CONTENT: '["json","pickle"]'
  depends_on:
    redis: { condition: service_healthy }
  networks: [folio-net]
  labels:
    service: celery-exporter
    environment: production
```

`prometheus.yml`:

```yaml
  - job_name: celery
    scrape_interval: 15s
    static_configs:
      - targets: ['celery-exporter:9808']
        labels: { service: celery }
```

**Option B: 워커 프로세스 내 노출** (`prometheus_client.start_http_server`를 worker bootstrap에 호출 — color 라벨 정확하지만 코드 변경 필요)

```python
# ai/app/celery_app.py (signal hook)
from celery.signals import worker_process_init
from prometheus_client import start_http_server

@worker_process_init.connect
def start_metrics_server(**_):
    start_http_server(8001)
```

→ `prometheus.yml`을 docker_sd 잡으로 변경하여 `folio-celery-worker-(blue|green):8001` 발견.

**신규 대시보드 `folio-celery.json`** 패널 4종:
- 작업 처리 속도: `rate(celery_task_succeeded_total[5m])` by(name)
- 실패율: `rate(celery_task_failed_total[5m]) / rate(celery_task_succeeded_total[5m])`
- 큐 적체: `celery_queue_length` (Redis 기반이라 자동)
- 작업 지연 p95: `histogram_quantile(0.95, rate(celery_task_runtime_bucket[5m]))`

**블루그린 호환성**: Option A는 worker가 아닌 broker(Redis)를 보므로 swap 무영향. Option B는 docker_sd가 자동 처리.

---

### B-5. Vault 메트릭 익스포터 부재 🔴

**증상 / 영향**
- Vault는 `deploy.sh:78`에서 backend 부팅 전 필수 검증 대상. seal 상태, 토큰 만료, transit 부하를 메트릭으로 못 봄 → unseal 누락 사고가 알림 없이 backend 실패로 이어짐.

**근거**
- `infra/vault/`의 Vault config에 telemetry 블록 미확인. `prometheus.yml`에 vault 잡 없음.

**권고 변경**

(1) Vault config 파일(`infra/vault/config/vault.hcl` 등)에 추가:

```hcl
telemetry {
  prometheus_retention_time = "30s"
  disable_hostname          = true
}

# 그리고 기존 listener "tcp" 블록 내부:
listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = 1
  telemetry {
    unauthenticated_metrics_access = true   # folio-net 내부만 접근 가능하므로 안전
  }
}
```

(2) `prometheus.yml`:

```yaml
  - job_name: vault
    scrape_interval: 30s
    metrics_path: /v1/sys/metrics
    params:
      format: ['prometheus']
    static_configs:
      - targets: ['folio-vault-prod:8200']
        labels: { service: vault }
```

(3) `folio-operations-health.json`에 패널 2종 추가:
- Vault sealed 상태: `vault_core_unsealed` (1=정상, 0=sealed)
- Transit encrypt rate: `rate(vault_transit_encrypt_count[5m])`

**블루그린 호환성**: Vault는 base 단일 인스턴스. swap 무관. unsealed가 0이 되면 B-3의 `folio-vault-sealed` 룰이 트리거.

---

## 6. P1 — 가시성 확장 (운영 신뢰도 향상)

### C-1. FastAPI / Spring 대시보드를 `$color` 변수화 🟡

**증상**: §3 표에서 ⚠️ 표시된 패널 대부분이 색상별 분리를 안 한다. 카나리 트래픽 비교/단일 색상 디버깅이 어렵다.

**근거**:
- `folio-fastapi.json` panel 2 (p50/p95/p99): `histogram_quantile(0.50, sum(rate(http_request_duration_seconds_bucket{service="ai"}[5m])) by (le))` — `color` 차원 누락.
- `folio-spring-jvm.json` panel 1: `jvm_memory_used_bytes{service="backend",area="heap"}` legend는 `{{color}}`인데 `by` 없음 → 모든 시계열이 `color` 라벨 보유하지만 패널이 색상 그룹화를 안 하니 시각화상 색상 분리만 우연히 동작하는 상태.

**권고 변경 — 대시보드 JSON 패치**

`folio-fastapi.json`, `folio-spring-jvm.json` 상단에 templating 변수 추가:

```json
"templating": {
  "list": [
    {
      "name": "color",
      "label": "Deployment color",
      "type": "custom",
      "query": "All,blue,green",
      "current": { "text": "All", "value": ".*" },
      "options": [
        { "text": "All",   "value": ".*",   "selected": true },
        { "text": "blue",  "value": "blue", "selected": false },
        { "text": "green", "value": "green","selected": false }
      ]
    }
  ]
}
```

각 PromQL을 다음과 같이 패치 (예시):

```promql
# FastAPI 응답시간 p95 (수정 전)
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{service="ai"}[5m])) by (le))

# 수정 후
histogram_quantile(
  0.95,
  sum(rate(http_request_duration_seconds_bucket{service="ai", color=~"$color"}[5m])) by (le, color)
)
```

```promql
# Spring Heap (수정 후)
jvm_memory_used_bytes{service="backend", area="heap", color=~"$color"}
```

```promql
# Spring HikariCP (수정 후)
hikaricp_connections_active{service="backend", color=~"$color"}
```

**블루그린 호환성**: 색상 라벨이 메트릭에 이미 부착돼 있어 안전. P0-1 적용 후 cAdvisor 패널까지 동일 패턴 가능.

---

### C-2. AI/LLM 토큰·비용 메트릭 🟡

**증상**: Anthropic/OpenAI 호출 토큰 사용량, 누적 비용, 모델별 지연을 추적 안 함. AI 비용이 통제·예측 불가.

**근거**: `ai/app/` 코드에 `prometheus_client.Counter`/`Histogram` 정의 없음 (instrumentator 자동 HTTP 메트릭만).

**권고 변경 — Python 코드 패치**

`ai/app/core/metrics.py` 신설:

```python
from prometheus_client import Counter, Histogram

LLM_TOKENS = Counter(
    "llm_tokens_total",
    "Total tokens consumed by LLM calls",
    ["provider", "model", "direction"],  # direction = input | output
)
LLM_COST_USD = Counter(
    "llm_cost_usd_total",
    "Estimated USD cost of LLM calls",
    ["provider", "model"],
)
LLM_LATENCY = Histogram(
    "llm_latency_seconds",
    "LLM call wall-clock latency",
    ["provider", "model"],
    buckets=(0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 60),
)
LLM_ERRORS = Counter(
    "llm_errors_total",
    "LLM call failures",
    ["provider", "model", "reason"],
)
```

LLM 래퍼(예: `ai/app/services/llm_client.py`)에서:

```python
import time
from app.core.metrics import LLM_TOKENS, LLM_COST_USD, LLM_LATENCY, LLM_ERRORS

PRICING_PER_1K = {  # 2026-05 기준, 정기 업데이트 필요
    ("anthropic", "claude-opus-4-7"):     {"input": 0.015, "output": 0.075},
    ("anthropic", "claude-sonnet-4-6"):   {"input": 0.003, "output": 0.015},
    ("openai",    "gpt-4.1"):             {"input": 0.005, "output": 0.015},
}

def track_llm_call(provider: str, model: str):
    def decorator(fn):
        async def wrapper(*args, **kwargs):
            start = time.perf_counter()
            try:
                resp = await fn(*args, **kwargs)
            except Exception as e:
                LLM_ERRORS.labels(provider, model, type(e).__name__).inc()
                raise
            elapsed = time.perf_counter() - start
            usage = getattr(resp, "usage", None)
            if usage:
                ip = usage.input_tokens
                op = usage.output_tokens
                LLM_TOKENS.labels(provider, model, "input").inc(ip)
                LLM_TOKENS.labels(provider, model, "output").inc(op)
                price = PRICING_PER_1K.get((provider, model), {})
                cost = (ip * price.get("input", 0) + op * price.get("output", 0)) / 1000
                LLM_COST_USD.labels(provider, model).inc(cost)
            LLM_LATENCY.labels(provider, model).observe(elapsed)
            return resp
        return wrapper
    return decorator
```

**신규 대시보드 `folio-ai-cost.json`** 패널 5종:
- 일일 토큰 소비(direction별): `sum by(direction) (increase(llm_tokens_total[1d]))`
- 누적 비용(provider/model별): `sum by(provider, model) (llm_cost_usd_total)`
- 비용 burn rate (시간당): `sum(rate(llm_cost_usd_total[1h])) * 3600`
- 모델별 지연 p95: `histogram_quantile(0.95, sum(rate(llm_latency_seconds_bucket[5m])) by (le, model))`
- 에러율: `rate(llm_errors_total[5m])` by(reason)

**알람 추가 (B-3 룰셋에 append)**:

```yaml
- uid: folio-llm-cost-burn
  title: LLM 시간당 비용 임계 초과
  condition: A
  for: 15m
  data:
    - refId: A
      datasourceUid: prometheus
      relativeTimeRange: { from: 900, to: 0 }
      model:
        expr: 'sum(rate(llm_cost_usd_total[1h])) * 3600 > 5.0'   # $5/hr
        instant: true
  labels: { severity: medium }
  annotations: { summary: "LLM 비용 시간당 $5 초과 — 트래픽 폭주 또는 무한루프 의심" }
```

**블루그린 호환성**: 메트릭 정의가 모듈 import 시점에 생성되므로 새 색상 컨테이너 가동 후 첫 호출부터 노출. relabel로 `color` 라벨 자동 부착 → swap 무영향.

---

### C-3. 비즈니스 메트릭 (결제·구독) 🟡

**증상**: 결제 성공/실패, 환불, 구독 활성 사용자 수를 운영 현황 대시보드의 Loki `|~ "Payment|..."` 텍스트 검색만으로 추정. 시계열 분석·알람 부적합.

**근거**: `folio-operations-overview.json` panel 6 (Loki grep).

**권고 변경 — Kotlin/Java 코드 패치**

Spring Boot에 `MeterRegistry` 사용:

```kotlin
@Component
class PaymentMetrics(private val registry: MeterRegistry) {
    fun recordAttempt(result: String, channel: String) {
        registry.counter("payment_attempt_total", "result", result, "channel", channel).increment()
    }
    fun recordRefund(reason: String) {
        registry.counter("refund_total", "reason", reason).increment()
    }
    fun recordPaymentLatency(channel: String, seconds: Double) {
        registry.timer("payment_latency_seconds", "channel", channel).record(Duration.ofMillis((seconds * 1000).toLong()))
    }
}

// SubscriptionService 측: 주기적으로 게이지 업데이트
@Bean
fun activeSubscriptions(registry: MeterRegistry, repo: SubscriptionRepository) =
    Gauge.builder("subscription_active_users", repo) { it.countActive().toDouble() }
         .register(registry)
```

**신규 대시보드 `folio-business.json`** 패널 6종:
- 결제 성공률: `sum(rate(payment_attempt_total{result="success"}[5m])) / sum(rate(payment_attempt_total[5m])) * 100`
- 결제 채널별 분포: `sum by(channel) (rate(payment_attempt_total[5m]))`
- 결제 지연 p95: `histogram_quantile(0.95, sum(rate(payment_latency_seconds_bucket[5m])) by (le, channel))`
- 환불 추이: `sum by(reason) (rate(refund_total[1h])) * 3600`
- 활성 구독자 수: `subscription_active_users`
- 시간별 신규 결제: `sum(increase(payment_attempt_total{result="success"}[1h]))`

**알람 추가**:

```yaml
- uid: folio-payment-success-rate-drop
  title: 결제 성공률 < 90%
  condition: A
  for: 10m
  data:
    - refId: A
      datasourceUid: prometheus
      relativeTimeRange: { from: 600, to: 0 }
      model:
        expr: |
          sum(rate(payment_attempt_total{result="success"}[5m]))
          / sum(rate(payment_attempt_total[5m])) < 0.9
        instant: true
  labels: { severity: critical }
  annotations: { summary: "결제 성공률 10분간 90% 미만" }
```

**블루그린 호환성**: 메트릭은 micrometer로 actuator에 자동 노출 → 두 색상 모두 `color` 라벨 포함. 사용자 활동 카운터는 합산(`sum without(color)`)으로 표시하면 swap 시 자연스럽게 누적.

---

### C-4. PostgreSQL 캐시 히트율 / Slow Query 패널 🟡

**증상**: `folio-db-redis.json`은 connections/size/locks/commits만. 인덱스 효율, 가장 느린 쿼리 미시각화.

**근거**: postgres-exporter 기본 메트릭만 사용 중. `pg_stat_statements`가 활성화돼 있다면 더 풍부한 메트릭 가능.

**권고 변경**

**A) 캐시 히트율 패널 (extension 없이 즉시 가능)** — `folio-db-redis.json`에 추가:

```promql
# 데이터베이스별 캐시 히트율 (target: > 99%)
sum by(datname) (rate(pg_stat_database_blks_hit[5m]))
  / (sum by(datname) (rate(pg_stat_database_blks_hit[5m])) + sum by(datname) (rate(pg_stat_database_blks_read[5m])))
```

```promql
# 테이블별 시퀀셜 스캔 비율 (target: < 10%)
rate(pg_stat_user_tables_seq_scan[5m])
  / (rate(pg_stat_user_tables_seq_scan[5m]) + rate(pg_stat_user_tables_idx_scan[5m]))
```

**B) pg_stat_statements (extension 필요, optional)**

PostgreSQL initdb 시 `shared_preload_libraries=pg_stat_statements` 설정 + `CREATE EXTENSION` 필요. 그 후 postgres-exporter custom queries 추가:

```yaml
# infra/prod/postgres-exporter/queries.yaml
pg_stat_statements:
  query: |
    SELECT
      (regexp_replace(query, E'[\\n\\r]+', ' ', 'g'))::char(120) AS short_query,
      calls,
      total_exec_time / 1000 AS total_seconds,
      mean_exec_time AS mean_ms
    FROM pg_stat_statements
    ORDER BY total_exec_time DESC
    LIMIT 20
  metrics:
    - calls:          { usage: COUNTER, description: "Number of executions" }
    - total_seconds:  { usage: COUNTER, description: "Total seconds" }
    - mean_ms:        { usage: GAUGE,   description: "Mean execution time (ms)" }
```

→ 익스포터 시작 옵션에 `--extend.query-path=/etc/postgres_exporter/queries.yaml` 추가.

**블루그린 호환성**: PostgreSQL 자체가 base. swap 무관.

---

### C-5. MongoDB Oplog Window 알람화 🟡

**증상**: `folio-powersync-mongo.json` panel 2에 oplog window stat 있으나 임계치 시각화 없음. 1h 미만이면 PowerSync 클라이언트 재동기화 폭주 위험.

**근거**: 패널 JSON에 thresholds 미설정.

**권고 변경 — 패널 JSON 패치**:

```json
{
  "title": "Oplog Window (보관 가능 시간)",
  "type": "stat",
  "fieldConfig": {
    "defaults": {
      "unit": "s",
      "thresholds": {
        "mode": "absolute",
        "steps": [
          { "color": "red",    "value": null },
          { "color": "yellow", "value": 3600 },
          { "color": "green",  "value": 7200 }
        ]
      }
    }
  }
}
```

알람은 B-3의 `folio-mongo-oplog-low`로 이미 커버.

**블루그린 호환성**: MongoDB base. 무관.

---

### C-6. PowerSync 애플리케이션 메트릭 🟡

**증상**: 현재 `folio-powersync-mongo.json` panel 6은 cAdvisor `container_cpu_usage_seconds_total{name="folio-powersync-prod"}`만 본다. 실시간 활성 sync connections, replication lag 등 PowerSync 자체 메트릭은 노출 안 됨.

**권고 변경**

PowerSync 서비스(`journeyapps/powersync-service:latest`)의 `/probes/metrics` 엔드포인트가 노출되는지 docs 확인 후, 가능하다면 `prometheus.yml`에 잡 추가:

```yaml
  - job_name: powersync
    scrape_interval: 30s
    metrics_path: /probes/metrics
    static_configs:
      - targets: ['folio-powersync-prod:8080']
        labels: { service: powersync }
```

`folio-powersync-mongo.json`에 패널 추가:
- 활성 sync connections: `powersync_active_connections`
- 동기화 throughput: `rate(powersync_data_replicated_bytes_total[5m])`
- replication lag: `powersync_replication_lag_seconds`

PowerSync 버전에 따라 metric 이름이 다를 수 있어 **로컬 검증 필요**:

```bash
docker exec folio-powersync-prod curl -s http://localhost:8080/probes/metrics | head -50
```

만약 PowerSync가 메트릭 엔드포인트를 노출하지 않는다면 이 항목은 dropped, JSON 로그(`{service="powersync"}`) 기반 LogQL 패널로 대체.

**블루그린 호환성**: PowerSync base. 무관.

---

## 7. P2 — 신뢰도/위생 (장기 개선)

### D-1. Promtail / Prometheus 디스커버리 간격 정렬 🟢

**증상**: Promtail `refresh_interval: 5s` vs Prometheus `refresh_interval: 30s`. swap 직후 약 25초 동안 로그는 들어오는데 메트릭은 안 들어와 대시보드가 patchy.

**권고**: `prometheus.yml`의 spring-boot/fastapi 잡 둘 다 `refresh_interval: 15s`로 변경 (Promtail은 그대로 5s 유지하거나 똑같이 15s로 통일).

```yaml
docker_sd_configs:
  - host: unix:///var/run/docker.sock
    refresh_interval: 15s   # 30s → 15s
    filters: [...]
```

**블루그린 호환성**: 더 빠른 디스커버리는 swap 자연스러움 증진. 부작용 없음.

---

### D-2. Promtail/Loki max_line_size 8KB → 16KB 🟢

**증상**: `loki-config.yml`의 `max_line_size: 8192`. Spring Boot 대형 스택트레이스나 큰 JSON 페이로드가 잘림.

**권고**: `loki-config.yml`:

```yaml
limits_config:
  max_line_size: 16384            # 8192 → 16384
  ingestion_rate_mb: 6            # 4 → 6 (헤드룸 확보)
  ingestion_burst_size_mb: 12     # 8 → 12
```

대응하여 Promtail 파이프라인의 oversized line drop 기준도 8KB → 16KB로 상향. (`promtail-config.yml`에서 `match` stage)

**블루그린 호환성**: 무관.

---

### D-3. deploy.sh에 Prometheus 즉시 reload 호출 추가 🟢

**증상**: Docker SD가 30s마다 갱신되므로 swap 직후 최대 30초 메트릭 갱신 지연. `--web.enable-lifecycle`이 이미 ON이므로 reload 가능.

**권고**: `infra/scripts/deploy.sh:148` (nginx 안정화 sleep 다음) 한 줄 추가:

```bash
echo "[deploy] Waiting 5s for nginx to stabilize..."
sleep 5

# 즉시 Prometheus 재로드 + targets 강제 리프레시
docker exec folio-prometheus wget -q -O - --post-data='' http://localhost:9090/-/reload || true
```

**블루그린 호환성**: 오히려 swap 직후 양 색상 가시성을 더 빠르게 안정화.

---

### D-4. 컨테이너 재시작 카운트 패널 🟢

**증상**: 비정상 OOM/패닉으로 컨테이너가 자동 재시작되는 상황을 별도 시각화 안 함.

**권고**: `folio-operations-health.json`에 패널 추가:

```promql
# 최근 24h 컨테이너 재시작 횟수 (start_time 변화 횟수)
count_over_time(
  changes(container_start_time_seconds{name=~"folio-.*"}[1h])[24h:1h]
)
```

(P0-1 적용 후엔 `color`/`service` 라벨로 분해 가능)

알람 추가:

```yaml
- uid: folio-container-restart-loop
  title: 컨테이너 재시작 반복
  condition: A
  for: 10m
  data:
    - refId: A
      datasourceUid: prometheus
      relativeTimeRange: { from: 600, to: 0 }
      model:
        expr: 'changes(container_start_time_seconds{name=~"folio-.*"}[10m]) > 3'
        instant: true
  labels: { severity: high }
  annotations: { summary: "{{ $labels.name }} 10분간 3회 이상 재시작" }
```

---

### D-5. Loki retention 7d → 14d 검토 🟢

**증상**: Prometheus 15d / Loki 7d 비대칭. 1주 지난 사고의 메트릭은 보이지만 로그는 사라짐.

**권고**: 디스크 여유 확인 후:

```yaml
# loki-config.yml
limits_config:
  retention_period: 336h   # 168h → 336h (14일)
```

디스크 사용량 모니터링 결과 보고 조정.

---

### D-6. base compose 공유 서비스에 `service` 라벨 부여 🟢

**증상**: cAdvisor에서 nginx, postgres, redis, mongo, powersync, vault 메트릭이 `name=...`로만 식별 가능, `service=...`로 일관 필터 불가.

**권고**: §5 B-1의 마지막 블록 참조. base compose의 6개 공유 서비스에 `labels: { service: ..., environment: production }` 추가.

---

## 8. 권고 적용 순서

```
[Phase 1 — P0 즉시 수정]    배포 1
  1. B-1: compose labels 추가 (blue/green/base 전부)
  2. B-2: nginx stub_status + nginx-exporter + folio-nginx.json
  3. B-4: celery-exporter + folio-celery.json
  4. B-5: vault telemetry + scrape
  5. B-3: alerting 룰 + contact-point + policy 프로비저닝
  → 적용 후 §10 검증 절차 1~4 실행

[Phase 2 — P1 가시성]       배포 2
  6. C-1: FastAPI / Spring 대시보드 $color 변수화
  7. C-4: PG 캐시 히트율 패널 추가 (extension 없이 가능 분만)
  8. C-5: Oplog window 임계 시각화
  → §10 검증 절차 5~7 실행

[Phase 3 — P1 코드 변경]    배포 3
  9. C-2: LLM 비용 메트릭 (Python 코드 + dashboard)
  10. C-3: 비즈니스 메트릭 (Kotlin 코드 + dashboard)
  11. C-6: PowerSync 메트릭 (가능 여부 검증 후)
  → §10 검증 절차 8 실행

[Phase 4 — P2 위생]         배포 4 (또는 P1과 묶음)
  12. D-1 ~ D-6 일괄
```

블루그린 swap이 한 번이라도 도는 단계마다 §10의 swap 검증을 한 번씩 돌릴 것.

---

## 9. CI/CD 적용 시 주의사항

본 보고서의 변경은 모두 **base + blue/green compose 양쪽에 영향**을 줄 수 있다.

| 변경 | base compose | blue compose | green compose | nginx reload | Prometheus reload | Grafana 재기동 |
|---|---|---|---|---|---|---|
| B-1 labels | ◯(공유) | ◯ | ◯ | — | — | — |
| B-2 nginx-exporter | ◯ 추가 | — | — | ◯ | ◯ | — |
| B-3 alerting | — | — | — | — | — | ◯ (provisioning 재로드) |
| B-4 celery-exporter | ◯ 추가 | — | — | — | ◯ | — |
| B-5 vault telemetry | ◯ | — | — | — | ◯ | — |
| C-1 dashboard | — | — | — | — | — | ◯ |
| C-2 LLM 메트릭 | — | ◯ (이미지 재빌드) | ◯ (이미지 재빌드) | — | — | ◯ (dashboard) |
| C-3 비즈니스 | — | ◯ (이미지 재빌드) | ◯ (이미지 재빌드) | — | — | ◯ (dashboard) |
| D-3 deploy.sh | (스크립트만) | — | — | — | — | — |

**권고 배포 시퀀스**:
1. base compose만 변경하는 항목(B-2, B-4, B-5, D-2, D-5)은 `docker compose -f docker-compose.yml --env-file .env up -d <changed-service>`로 **부분 재기동** (앱 컨테이너는 그대로).
2. B-1처럼 blue/green compose가 함께 바뀌는 경우는 반드시 **blue-green swap을 통해서만** 반영 (label 변경은 컨테이너 재생성 필요).
3. C-2, C-3는 앱 이미지 자체가 바뀌므로 새 IMAGE_TAG로 deploy.sh 실행.

---

## 10. 검증 절차

각 단계 적용 후 다음을 순차 실행하여 정상성 확인.

### 10.1 기본 헬스 (모든 단계 공통)
```bash
# 1) Prometheus 모든 타겟 UP
curl -s http://localhost:9090/api/v1/targets | jq '[.data.activeTargets[] | {job:.labels.job, instance:.labels.instance, health}] | group_by(.health) | map({state:.[0].health, count:length})'

# 2) Prometheus 라벨 값 확인
curl -s http://localhost:9090/api/v1/label/color/values   # ["blue","green"] (양쪽 다 떠 있을 때)
curl -s http://localhost:9090/api/v1/label/service/values # 모든 service 라벨

# 3) Loki 라벨
curl -s 'http://localhost:3100/loki/api/v1/label/color/values'
curl -s 'http://localhost:3100/loki/api/v1/label/service/values'

# 4) Grafana 헬스
curl -s http://localhost:3000/grafana/api/health
```

### 10.2 B-1 (cAdvisor 라벨) 검증
```bash
docker inspect folio-backend-green --format '{{json .Config.Labels}}' | jq
# → {"color":"green","environment":"production","service":"backend"} 포함 확인

# 메트릭에 라벨 전달됐는지
curl -s 'http://localhost:9090/api/v1/query?query=container_cpu_usage_seconds_total{color="green"}' \
  | jq '.data.result | length'
# → 0보다 커야 함
```

### 10.3 B-2 (NGINX) 검증
```bash
# 익스포터 직접 메트릭
docker exec folio-nginx-exporter wget -qO- http://localhost:9113/metrics | head -20

# stub_status 자체
docker exec folio-nginx curl -s http://localhost:8888/nginx_status
```

### 10.4 B-3 (Alerting) 검증
```bash
# 룰이 로드됐는지
curl -s http://localhost:3000/grafana/api/v1/provisioning/alert-rules -u admin:$GF_PWD | jq 'length'
# → 8 이상 (룰 개수)

# 일부러 임계 초과시켜 firing 확인
docker stop folio-backend-green
sleep 150
curl -s http://localhost:3000/grafana/api/v1/provisioning/alert-rules -u admin:$GF_PWD | jq '.[].state'
docker start folio-backend-green
```

### 10.5 B-4 (Celery) 검증
```bash
curl -s http://localhost:9090/api/v1/query?query=celery_task_succeeded_total | jq '.data.result[0]'
# → 결과 존재
```

### 10.6 B-5 (Vault) 검증
```bash
curl -s 'http://localhost:9090/api/v1/query?query=vault_core_unsealed' | jq '.data.result[0].value[1]'
# → "1"
```

### 10.7 C-1 (대시보드 색상 변수) 검증
- Grafana UI에서 FastAPI / Spring 대시보드 상단 Color dropdown 노출 확인.
- blue / green / All 각각 선택 시 데이터 시리즈 분리/통합 동작 확인.

### 10.8 blue↔green swap 종합 검증
```bash
# 현재 색상 확인
cat /opt/folio/active-color

# 새 이미지 태그로 deploy
bash /opt/folio/S14P31F203/infra/scripts/deploy.sh <NEW_TAG>

# swap 후 15초 ~ 60초 사이에 다음 모두 만족하는지
curl -s http://localhost:9090/api/v1/label/color/values   # ["blue","green"] 둘 다 나옴 (~30s 윈도우 동안)
sleep 90
curl -s http://localhost:9090/api/v1/label/color/values   # 새 색상만 (old 색상 stale 후)

# 양 색상 모두 메트릭이 들어왔는지 (swap 윈도우 동안)
curl -s 'http://localhost:9090/api/v1/query?query=count by (color) (up{job="spring-boot"} == 1)'
```

---

## 11. 부록 A — 신규 Alert Rules YAML 초안 (통합본)

§5 B-3 + §6 C-2 + §6 C-3 + §7 D-4의 룰을 합친 통합본을 `infra/prod/grafana/provisioning/alerting/rules.yml` 단일 파일로 작성. 위 본문에 모든 룰 정의가 포함되어 있으니 그대로 합쳐 사용. 그룹은 다음 3개로 분류 권장:

| 그룹 | 룰 |
|---|---|
| folio-critical (interval 1m) | app-down, vault-sealed, payment-success-rate-drop |
| folio-high (interval 1m) | http-5xx-spike, disk-low, mem-low, pg-connections-high, redis-mem-high, container-restart-loop |
| folio-medium (interval 5m) | mongo-oplog-low, llm-cost-burn |

---

## 12. 부록 B — 신규 대시보드 패널 스펙 (개요)

본 보고서가 직접 JSON을 첨부하지는 않으나, 각 신규 대시보드는 다음 패널들로 구성하면 충분하다. JSON 직조립은 기존 `folio-operations-health.json`을 베이스로 복사 후 panel 영역만 교체하는 방식 권장.

### `folio-nginx.json`
1. 활성 연결 — `nginx_connections_active`
2. 초당 요청 — `rate(nginx_http_requests_total[5m])`
3. accept 대 handled — `rate(nginx_connections_accepted[5m])`, `rate(nginx_connections_handled[5m])`
4. 5xx 비율 (Loki LogQL): `sum(rate({service="nginx"} | json | status =~ "5.."[5m])) / sum(rate({service="nginx"}[5m]))`
5. 업스트림 응답시간 p95 (Loki) — JSON 필드 `upstream_response_time`
6. 경로별 Top 10 요청 (Loki) — JSON 필드 `uri`

### `folio-celery.json`
1. 작업 성공/실패 처리율 — `rate(celery_task_succeeded_total[5m])`, `rate(celery_task_failed_total[5m])`
2. 큐 적체 — `celery_queue_length` by(queue)
3. 작업 지연 p50/p95/p99 — `celery_task_runtime_bucket`
4. 작업명별 실패 Top — `topk(5, increase(celery_task_failed_total[1h])) by(name)`
5. (옵션) 워커 카운트 — `celery_workers`

### `folio-ai-cost.json`
1. 일일 토큰(direction별) — `sum by(direction) (increase(llm_tokens_total[1d]))`
2. 누적 비용(provider/model별) — `sum by(provider, model) (llm_cost_usd_total)`
3. 시간당 비용 — `sum(rate(llm_cost_usd_total[1h])) * 3600`
4. 모델별 지연 p95 — `histogram_quantile(0.95, sum(rate(llm_latency_seconds_bucket[5m])) by (le, model))`
5. 에러율(reason별) — `rate(llm_errors_total[5m]) by(reason)`
6. 호출 throughput(provider별) — `sum by(provider) (rate(llm_tokens_total[5m]))`

### `folio-business.json`
1. 결제 성공률 — `sum(rate(payment_attempt_total{result="success"}[5m])) / sum(rate(payment_attempt_total[5m]))`
2. 결제 처리 throughput(channel별) — `sum by(channel) (rate(payment_attempt_total[5m]))`
3. 결제 지연 p95 — `histogram_quantile(0.95, sum(rate(payment_latency_seconds_bucket[5m])) by (le, channel))`
4. 환불 추이(reason별) — `sum by(reason) (rate(refund_total[1h])) * 3600`
5. 활성 구독자 수(stat) — `subscription_active_users`
6. 시간별 신규 결제 성공 — `sum(increase(payment_attempt_total{result="success"}[1h]))`

---

## 13. 부록 C — 로컬 작업 / 배포 권고 순서

EC2에서 본 보고서를 받은 뒤 로컬에서의 실작업 흐름:

```bash
# 1. EC2 → 로컬 복사
scp ec2:/opt/folio/MONITORING_AUDIT_2026-05-11.md ./

# 2. feature 브랜치 분기
git switch -c chore/monitoring-audit-2026-05-11

# 3. P0 적용 (커밋 1: cAdvisor labels)
# infra/prod/docker-compose.{blue,green,base}.yml 수정
git add infra/prod/docker-compose.*.yml
git commit -m "infra: add color/service labels to compose for cAdvisor"

# 4. P0 적용 (커밋 2: 모니터링 익스포터 3종 + alerting)
# nginx-exporter, celery-exporter, vault telemetry, alerting/*.yml
git commit -m "infra: add nginx/celery/vault exporters and Grafana alert rules"

# 5. P1 적용 (커밋 3: dashboard color 변수화)
git commit -m "grafana: parametrize FastAPI/Spring dashboards by deployment color"

# 6. P1 적용 (커밋 4: 앱 코드의 LLM/비즈니스 메트릭)
git commit -m "ai: instrument LLM token/cost metrics; backend: payment/subscription meters"

# 7. P2 일괄 (커밋 5)
git commit -m "ops: align scrape intervals, raise Loki line size, add restart count panel"

# 8. PR → main 머지 → CI/CD가 EC2에서 deploy.sh 자동 실행 → blue↔green swap 1회
#    각 phase 마다 §10 검증 실행
```

추가 참고: B-3의 contact-point는 보고서에서 placeholder만 두었다. 실제 Slack webhook URL이나 SMTP 계정은 Doppler `prd` config에 `SLACK_WEBHOOK_URL` 등으로 추가한 뒤 grafana 컨테이너에 환경변수 주입(이미 `--env-file .env`로 deploy.sh가 처리) → provisioning에서 `${SLACK_WEBHOOK_URL}` 치환되도록 grafana 옵션 `GF_FEATURE_TOGGLES_ENABLE: provisioning` + `GF_PATHS_PROVISIONING` 기본 동작 활용.

---

## 14. 마무리

본 보고서는 2026-05-11 기준 EC2 prod의 모니터링 코드/설정/데이터를 직접 점검한 결과를 담는다. 가장 큰 위험은 **알람 부재**(어떤 사고도 자동 통보 안 됨) 와 **cAdvisor 라벨 누락**(컨테이너 리소스 색상별 분석 불가) 둘이며, 나머지 항목은 운영 신뢰도/생산성 향상에 해당한다.

블루그린 무중단 배포 구조 자체는 견고히 설계되어 있으므로, 위 P0 항목 적용 후 한 차례 blue↔green swap을 돌려보고 §10의 종합 검증이 모두 통과하면 P1으로 진행해도 안전하다.

— 끝 —
