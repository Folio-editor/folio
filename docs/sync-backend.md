# Sync 백엔드 — 문서 통합됨

> 이 문서는 [powersync.md](./powersync.md)로 **통합**되었습니다.

PowerSync 관련 백엔드 구현(동기화 엔드포인트·FK depth 정렬·PATCH skip·Plan 1:1 upsert 등)은 [powersync.md §7 백엔드 업로드 엔드포인트 `/sync/upload`](./powersync.md#7-백엔드-업로드-엔드포인트-syncupload)에서 확인하세요.

| 주제 | 이동 위치 |
|------|-----------|
| `/sync/upload` 요청/응답 포맷 | [§7.1-7.2](./powersync.md#7-백엔드-업로드-엔드포인트-syncupload) |
| FK depth 정렬 | [§7.3](./powersync.md#73-fk-depth-정렬) |
| `SyncService` 12 process 메서드 패턴 | [§7.4](./powersync.md#74-syncservice--12-테이블-공통-패턴) |
| `containsKey` 헬퍼 / PATCH skip | [§7.5](./powersync.md#75-containskey-헬퍼--patch가-not-null을-덮어쓰지-않게) |
| `Plan.findByWorkId` 1:1 upsert | [§7.6](./powersync.md#76-plan-11-unique-특례) |
| 멱등성 · 재시도 안전성 | [§7.7](./powersync.md#77-멱등성--안전성-요약) |
| JWT kid / HS256 / aud 규약 | [§5](./powersync.md#5-jwt-인증-연동--3중-일치-규약) |
| 새 테이블 추가 절차 | [§12](./powersync.md#12-새-테이블-추가--4단계-가이드) |
| 트러블슈팅 | [§13.5](./powersync.md#135-자주-발생하는-오류) |

백엔드 전반(JWT · OAuth · CORS · Spring Security 등)은 [backend-implementation.md](./backend-implementation.md)를 참조하세요.
