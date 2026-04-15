# Sync 백엔드 문서 — 이동됨

> 이 문서는 [backend-implementation.md](./backend-implementation.md)로 **통합·대체**됐습니다.
> 구 버전은 `containsKey` 기반 PATCH 부분 업데이트, 고아 PATCH skip, FK depth 정렬, `Plan.findByWorkId` 1:1 upsert 등이 도입되기 전의 snapshot이라 현재 구현과 어긋나 유지하지 않습니다.

## 찾으시는 내용은?

| 주제 | 이동 위치 |
|------|-----------|
| `POST /api/v1/sync/upload` 요청/응답 포맷 | [backend-implementation.md §4](./backend-implementation.md#4-동기화-sync-모듈--핵심) |
| `SyncController` FK depth 정렬 | [backend-implementation.md §4.4](./backend-implementation.md#44-synccontrollerupload) |
| `SyncService` 12개 process 메서드 패턴 | [backend-implementation.md §4.5](./backend-implementation.md#45-syncservice--패턴화된-12-process-메서드) |
| PATCH/PUT/DELETE 시맨틱 & `containsKey` 헬퍼 | [backend-implementation.md §4.3, §4.5](./backend-implementation.md#43-op-시맨틱-powersync-규약) |
| 고아 PATCH skip 규약 | [backend-implementation.md §4.5](./backend-implementation.md#45-syncservice--패턴화된-12-process-메서드) |
| `Plan` 1:1 UNIQUE `findByWorkId` 특례 | [backend-implementation.md §4.6](./backend-implementation.md#46-plan-11-unique-특례) |
| JWT kid / HS256 / aud 규약 | [backend-implementation.md §2.4](./backend-implementation.md#24-jwt-구조-powersync-연동-필수-규약) |
| 멱등성 & 재시도 안전성 | [backend-implementation.md §5](./backend-implementation.md#5-멱등성--재시도-안전성) |
| 새 테이블 추가 절차 | [backend-implementation.md §6](./backend-implementation.md#6-새-테이블-추가-절차-4단계) |
| 트러블슈팅 & 디버깅 이력 | [backend-implementation.md §7, §11](./backend-implementation.md#7-운영-주의사항--알려진-함정) |

PowerSync 인프라 · sync-rules · 클라이언트 연결은 [powersync.md](./powersync.md)를, 프론트엔드 쓰기 흐름은 [sync-frontend.md](./sync-frontend.md)를 참조하세요.
