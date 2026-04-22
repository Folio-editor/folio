# Sync 프론트엔드 — 문서 통합됨

> 이 문서는 [powersync.md](./powersync.md)로 **통합**되었습니다.

PowerSync 관련 프론트엔드 구현(Connector · 로컬 SQLite 스키마 · `useLocalWrite` · 쓰기 흐름 등)은 [powersync.md](./powersync.md)에서 확인하세요.

| 주제 | 이동 위치 |
|------|-----------|
| 전체 데이터 흐름 (read / write up / sync down) | [§3](./powersync.md#3-3가지-데이터-흐름) |
| `db` 싱글턴 + DevTools `__db` | [§8.1](./powersync.md#81-싱글턴-db-인스턴스) |
| `FolioConnector` (fetchCredentials + uploadData) | [§8.2](./powersync.md#82-folioconnector--powersync-sdk-콜백-2개) |
| Vite WASM Worker 설정 | [§8.3](./powersync.md#83-vite-설정--wasm-worker) |
| 로컬 SQLite 스키마 (12 테이블) | [§9](./powersync.md#9-로컬-sqlite-스키마) |
| `useLocalWrite` 쓰기 헬퍼 | [§10.1](./powersync.md#101-쓰기--uselocalwrite) |
| 클라이언트 UUID 전략 | [§10.2](./powersync.md#102-클라이언트-uuid-전략) |
| `useQuery` + `useWriterId` 읽기 | [§10.3](./powersync.md#103-읽기--usequery--usewriterid) |
| connect 게이팅 개요 | [§11](./powersync.md#11-로그인-상태와-connect-게이팅-개요) |
| DevTools 디버깅 | [§13.3](./powersync.md#133-devtools-디버깅) |

auth 플로우 세부(syncDecision · lastKnownWriterId · SyncDecisionDialog · tokenRefreshScheduler)는 PowerSync 자체가 아닌 앱 인증 계층 — 별도 auth 문서를 참조하세요.
