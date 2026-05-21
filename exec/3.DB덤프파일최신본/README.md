# 3. DB 덤프 파일 최신본

| 파일 | 설명 |
|------|------|
| `folio_dump.sql` | PostgreSQL 전체 덤프 (DDL + 데이터) — `pg_dump` 결과물 |

- DB: **PostgreSQL 16** (운영은 pgvector pg17)
- 추출 시각: 2026-05-21
- 추출 명령:
  ```bash
  docker exec storyzip-postgresql-dev \
    pg_dump -U storyzip -d storyzip --no-owner --no-acl --clean --if-exists \
    > folio_dump.sql
  ```
- 적용 시점: `infra/db/schema.sql` (최초 DDL) + `infra/db/migrations/*.sql` (2026-05-04 ~ 2026-05-11) 누적 반영본
- 데이터: 시연용 가이드 워크스페이스 데이터는 앱 최초 실행 시 `예시와 함께 시작` 으로 자동 생성되므로, 본 덤프는 **빈 데이터 + 최신 스키마** 기준

## 적용 방법

### 새 환경에 복원

```bash
# 1. dev 인프라 기동
cd infra/dev
doppler run -- docker compose -f docker-compose.dev.yml up -d

# 2. 덤프 적용 (스키마 + 데이터)
docker exec -i storyzip-postgresql-dev \
  psql -U storyzip -d storyzip < folio_dump.sql
```

### 운영 EC2 복원

```bash
gunzip -c folio_dump.sql.gz | docker exec -i folio-postgresql-prod \
  psql -U folio -d folio
```

## 주의

- 복원 후 PowerSync를 사용하려면 PostgreSQL `wal_level=logical` 이 활성화되어야 한다 (`SHOW wal_level;`).
- PowerSync 전용 replication user(`folio_repl`)와 publication은 `infra/db/powersync-init.sh` 가 컨테이너 초기화 시 자동 생성한다.
- MongoDB(PowerSync bucket storage)는 PowerSync 내부 관리 영역이라 별도 덤프를 제공하지 않는다.
