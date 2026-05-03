# 프론트엔드 개발자용 암호화 가이드

이번 머지로 `develop`에 들어가는 **DB 데이터 암호화 (Plan C / 옵션 1)** 작업이 프론트 개발에 어떤 영향을 주는지 정리한 문서. 이 문서를 읽고 나면 다음을 알 수 있다.

- 어떤 데이터가 암호화되어 있고, 어떻게 읽고/쓰는가
- 새 기능 만들 때 무엇을 조심해야 하는가
- AI 호출하는 화면을 만들 때 어떻게 평문을 확보하는가
- 디버깅할 때 자주 빠지는 함정과 회피법

---

## 1. 한 줄 요약

> 사용자 원고/설정은 클라이언트에서 **AES-GCM**으로 암호화되어 SQLite·서버 DB·백업·로그 어디에도 평문으로 남지 않는다. 평문은 메모리에서만 잠시 존재하며, 운영자도 볼 수 없다.

---

## 2. 보안 모델 (옵션 1)

### 키 계층

```
[서버 보유] pepper_user (Secrets Manager) ┐
[로그인 응답] user_salt + sub             ├─► HKDF-SHA256 ─► KEK (메모리)
                                          │
[로컬 DB] work.encrypted_dek ─ AES-KW ─► work_key (메모리, 작품별)
                                          │
                                          └─► 컬럼 평문 ─ AES-GCM ─► v1:base64(IV||CT||TAG)
```

- **KEK** (Key Encryption Key): 사용자당 1개. 로그인 시 도출되어 메모리에만 존재. 로그아웃 시 폐기.
- **work_key** (DEK): 작품당 1개. KEK으로 wrap된 채 `work.encrypted_dek` 컬럼에 저장됨.
- **컬럼 값**: `v1:` 접두사 + base64(IV(12) || ciphertext || tag(16))

### "운영자도 못 본다"의 의미

- 서버는 KEK 도출에 필요한 `pepper_user`를 들고 있지만, 클라이언트의 `user_salt`/`sub` 없이는 KEK을 못 만든다 (그리고 user_salt는 로그인 응답으로만 흐른다).
- 백엔드 DB·백업·CloudWatch 로그에는 `v1:` 암호문만 존재.
- **트레이드오프**: 사용자가 키 복원 재료를 잃으면(예: 모든 디바이스 + 백엔드 DB 동시 손실) **복구 불가**. 이건 의도된 설계. E2EE까지는 가지 않음(서버는 pepper를 알기 때문).

---

## 3. 암호화 적용 테이블/컬럼

11개 테이블의 사용자 콘텐츠 컬럼이 `v1:` 형태로 저장된다.

| 테이블 | 암호화 컬럼 | 평문 유지 |
|---|---|---|
| work | title, author_name, description | status, sort_order, created_at, updated_at, encrypted_dek |
| episode | title, content | status, word_count, sort_order, work_id, parent_id, ... |
| character | name, description, ... | work_id, sort_order, ... |
| character_note | title, content | character_id, ... |
| character_custom_field | field_name, field_value | character_id, ... |
| plan_note | title, content | work_id, ... |
| world_note | title, content | work_id, parent_id, ... |
| plot | title, content | work_id, parent_id, sort_order, ... |
| foreshadow | title, content | work_id, importance, ... |
| foreshadow_link | context_memo | foreshadow_id, episode_id, ... |
| idea_archive | content, tag | work_id, ... |

**원칙**:
- **사용자 의도가 들어간 텍스트**는 암호화
- **운영/필터/정렬에 필요한 메타**는 평문 (status, sort_order, created_at, updated_at, work_id 같은 FK)

---

## 4. 일상 작업에서 알아야 할 패턴

### 4-1. 읽기: `useDecryptedXxx` 훅을 써라

`useQuery`로 직접 SELECT한 값은 **`v1:` 접두사가 붙은 암호문**이다. 그대로 화면에 그리면 안 된다.

| 화면에서 쓰던 것 | 대신 써야 할 훅 |
|---|---|
| `useQuery<Episode>('SELECT ... FROM episode')` | `useDecryptedEpisode(id)` |
| `useQuery<Work>('SELECT ... FROM work')` | `useDecryptedWork(id)` |
| world_note 리스트 | `useDecryptedWorldNoteList(rawRows)` |
| plot 리스트 | `useDecryptedPlotList(rawRows)` |
| character 리스트 | `useDecryptedCharacterList(rawRows)` |
| character_note 리스트 | `useDecryptedCharacterNoteList(rawRows)` |
| plan_note 리스트 | `useDecryptedPlanNoteList(rawRows)` |
| idea_archive 리스트 | `useDecryptedIdeaArchiveList(rawRows)` |

**리스트 패턴** — `useQuery`로 raw row를 가져온 다음 `useDecryptedXxxList`에 넘기는 2단계.

```tsx
// 잘못된 예 — 화면에 "v1:Aa9xK..." 가 그대로 뜬다
const { data: rows } = useQuery<EpisodeRow>('SELECT id, title FROM episode WHERE work_id = ?', [workId]);

// 올바른 예
const { data: rawRows = [] } = useQuery<RawEpisodeRow>(
  `SELECT e.id AS id, e.title AS title, e.work_id AS work_id,
          w.encrypted_dek AS encrypted_dek
   FROM episode e
   LEFT JOIN work w ON w.id = e.work_id
   WHERE e.work_id = ?`,
  [workId],
);
const { data: episodes } = useDecryptedEpisodeList(rawRows);
```

> **중요**: 리스트 훅은 raw row에 **`work_id` 와 `encrypted_dek`** 가 포함되어야 동작한다. SELECT 시 항상 LEFT JOIN으로 `w.encrypted_dek AS encrypted_dek` 를 같이 가져올 것.

### 4-2. 쓰기: `useLocalWrite()` 가 알아서 한다

`useLocalWrite`가 반환하는 함수들(`createWork`, `updateEpisode`, `createPlanNote`, ...)은 내부에서 자동으로 암호화한다. 호출자는 **평문을 그대로 넘기면 됨**.

```tsx
const { updateEpisode } = useLocalWrite();
await updateEpisode(id, { title: '1화. 점심', content: editor.getHTML() }); // 자동으로 v1: 암호화
```

직접 `db.execute('UPDATE episode SET content = ? ...', [editor.getHTML()])` 같은 호출은 **금지**. 평문이 SQLite에 들어가서 동기화 큐로 백엔드까지 새어나간다.

### 4-3. 복호화 상태 (`decryptStatus`) 처리

`useDecryptedXxx`는 `data.decryptStatus`로 현재 상태를 알려준다.

| status | 의미 | UI 권장 처리 |
|---|---|---|
| `loading` | 아직 복호화 진행 중 | 스피너 / Skeleton |
| `plain` | 평문 (게스트 또는 PR2 이전 데이터) | 그대로 표시 |
| `decrypted` | 정상 복호화 완료 | 그대로 표시 |
| `no-kek` | KEK 없음 (로그아웃/세션 만료) | "다시 로그인" 안내, 에디터 readonly |
| `no-work-key` | work_key 풀기 실패 (encrypted_dek 누락) | "데이터 손상 가능성" 경고 |
| `failed` | AES 복호화 실패 (tag mismatch 등) | 동일 경고 |

**AI 호출 가능 조건**: `decryptStatus`가 `plain` 또는 `decrypted` 일 때만.

---

## 5. AI 호출 화면 만들 때

PR5에서 **AI 서버는 더 이상 v1: 암호문 컬럼을 직접 SELECT하지 않는다.** 클라이언트가 평문 RAG 컨텍스트를 조립해 페이로드로 동봉해야 한다.

### 패턴

```tsx
const { payload, isLoading, hasUndecrypted } = useAiContextPayload(workId, episodeNum);

const handleGenerate = async () => {
  if (isLoading || !payload) {
    toast.error('AI 컨텍스트 준비 중', { description: '본문 복호화가 끝난 뒤 다시 시도해주세요.' });
    return;
  }
  // v1: 잔재가 페이로드에 있으면 호출 자체를 차단 — LLM이 못 읽는 데이터 전송 + 토큰 낭비 방지
  if (hasUndecrypted) {
    toast.error('암호화된 자료를 복호화하지 못했어요', {
      description: '다시 로그인하거나 작품을 다시 불러온 뒤 시도해주세요.',
    });
    return;
  }
  await apiClient.streamSSE('/ai/drafts', {
    workId, episodeId, storyline, currentEpisodeNum: episodeNum,
    context: payload, // 평문 RAG 페이로드를 동봉
  }, ...);
};
```

`useAiContextPayload`가 work/세계관 노트/이전 회차 본문 등을 KEK + work_key로 평문화해 조립한다. **AI 서버는 이 페이로드를 메모리에서만 사용하며, 영속화/로깅하지 않는다.**

---

## 6. 자주 빠지는 함정

### ⚠ PowerSync `useQuery` 가 SQL 에러를 swallow

PowerSync `useQuery`/`watch`는 SQL 실행 에러를 **콘솔에 안 띄우고 빈 배열을 반환**한다. 사이드바에서 "원고가 없어요" 같은 빈 결과가 나올 때, 훅이 깨진 게 아니라 **SQL이 터지고 있는** 케이스가 흔하다.

**대표적 함정**: episode/work, plot/work 등 LEFT JOIN한 두 테이블이 같은 컬럼명(`updated_at`, `created_at`, `sort_order`)을 가지면 ORDER BY 절이 ambiguous로 실패.

**회피책**:
1. SELECT 절에 항상 alias 명시: `SELECT e.updated_at AS updated_at, e.sort_order AS sort_order, ...`
2. ORDER BY는 alias 기준으로 작성
3. 디버깅 시 `usePowerSync().getAll(sql, params)` 를 try/catch 로 감싸 실제 에러 확인

### ⚠ dev 환경에서 prod 데이터 import 금지

dev 프로필에서도 fake `SecretsManagerClient`로 KEK 흐름이 켜져 있다. 그런데 **dev의 pepper 값은 prod와 다르다**. prod 데이터를 dev로 dump → import 하면 **모든 v1: 컬럼이 복호화 실패**한다(모든 행 `decryptStatus: 'failed'`).

### ⚠ 평문이 메모리에 남는 동안 실수로 어디 보내지 마라

복호화된 본문을 가져온 컴포넌트에서 그것을 그대로:
- `console.log` → 운영 빌드에서도 의외로 잘 살아남는다
- 분석 이벤트에 attribute로 첨부
- 디버깅 위해 외부 스토리지에 임시 저장

이런 경로로 흘리지 마라. 운영자가 못 보는 모델 자체가 깨진다. 분석에는 `charCountBucket(content.length)` 같은 **버킷화된 메타**만 보낸다.

---

## 7. 게스트 / 미로그인 동작

KEK이 없는 상태(게스트, 로그아웃, 세션 만료):

- **쓰기**: `useLocalWrite`는 평문 그대로 SQLite에 INSERT/UPDATE. `v1:` 접두사 안 붙음.
- **읽기**: `useDecryptedXxx` 훅은 `decryptStatus: 'plain'` 으로 그대로 반환.
- **로그인 후 백필**: `useBackfillEncryption` 훅이 AuthenticatedApp 마운트 시 자동 실행되어 평문 row들을 v1:로 변환. 1회성, 백그라운드.

이 폴백 덕분에 게스트 모드와 로그인 모드 사이에 데이터 단절이 없다.

---

## 8. 성능 한계 — fetch-all + 메모리 필터/정렬 패턴

암호문은 SQL `LIKE` / `ORDER BY title` 이 평문 기준으로 안 먹는다. 그래서 사이드바 리스트
들은 **fetch-all → 일괄 복호화 → 메모리에서 필터·정렬** 패턴을 쓴다. 코드를 새로 짤 때
이 패턴의 한계를 알고 있어야 한다.

### 컴포넌트별 가정 상한

| 화면 | 가정 상한 | 위험 시나리오 |
|---|---|---|
| `HomeWorkList` (작품) | ~30 | 작가 한 명의 작품 30개 초과 — 드뭄 |
| `CharacterNoteList` (캐릭터) | < 50 (코드 주석에 명시) | 장편 1작당 50~150명 |
| `PlotTreeList` (막) | ~20 | 일반적으로 안전 |
| `PlotTreeList` (회차) | ~50 / expand 시점에만 | 연재물은 100~500화도 가능 |
| Episode 목록 (본문 SELECT 시) | < 30 | 본문 일괄 복호화는 비싸다 |

### 임계값 넘는 화면을 짤 때 적용 순서

**1단계 — 즉시 가능 (PR 안에서)**

- 목록 화면에서는 본문(`content`) 컬럼을 SELECT에서 빼라 — title만 복호화
- expand 시점까지 자식 SELECT를 미뤄라 (`isExpanded ? sql : 'WHERE 0'` 패턴)
- 검색어가 짧으면(<2자) 필터를 건너뛰어라 — 복호화 직후 전체 노출

**2단계 — 별도 티켓 (회차 200+ / 캐릭터 100+)**

- list virtualization (react-window) + lazy decrypt 윈도우
- 보이는 viewport row만 복호화, 스크롤 시 unmount 된 row는 키 캐시에서 evict

**3단계 — 마지막 수단 (검색 빈도 높을 때)**

- 결정적 검색 인덱스: `HMAC(KEK, lowercase(title) trigram)` 컬럼 추가 → SQL `LIKE` 가능
- 단점: 정렬은 여전히 메모리, prefix만 매칭, 인덱스 컬럼 자체가 약한 누설(같은 단어가 같은 HMAC) — 보안 결정 필요

### 측정 안 했으면 추측하지 마라

위 표의 임계값은 추정이다. 실제 사용자 데이터에 의존하므로:

- 운영 후 **느려졌다는 리포트가 들어오면** 옵저빌리티 (FCP, INP) 로 검증
- 가상화 같은 큰 변경은 **측정된 병목**이 있을 때만 — 아닌데 들어가면 코드 복잡도만 늘어남

---

## 9. 새 기능 만들 때 체크리스트

- [ ] 새 컬럼이 사용자 텍스트인가? → 암호화 대상. `useLocalWrite` 헬퍼에 암호화 로직 추가
- [ ] 새 컬럼이 운영 메타(status/sort_order/FK)인가? → 평문 유지
- [ ] 화면에서 SELECT 하는가? → `useDecryptedXxx` 훅 거치는지 확인
- [ ] LEFT JOIN 쿼리인가? → SELECT 절에 alias 명시 (`AS column_name`)
- [ ] AI 호출하는가? → `useAiContextPayload` + `hasUndecrypted` 게이트 사용
- [ ] `decryptStatus` 별 UI 분기 있는가? (loading/no-kek/failed)
- [ ] `console.log`로 평문 본문 흘리지 않는가?
- [ ] **이 리스트의 예상 항목 수가 100+ 인가?** → 섹션 8의 1단계 최적화 적용, 200+면 가상화 티켓 분리
- [ ] **목록 화면에서 본문(`content`)을 SELECT 하는가?** → title만 SELECT. content는 상세 진입 시점에만

---

## 10. 관련 파일

- **암호화 코어**: `frontend/src/shared/crypto/{cipher,kek,workKey,lifecycle}.ts`
- **읽기 훅**: `frontend/src/shared/hooks/useDecrypted*.ts`
- **쓰기 헬퍼**: `frontend/src/shared/hooks/useLocalWrite.ts`
- **AI 컨텍스트**: `frontend/src/shared/hooks/useAiContextPayload.ts`
- **백필**: `frontend/src/shared/crypto/backfill.ts` + `useBackfillEncryption.ts`
- **타입**: `frontend/src/shared/types/{auth,aiContextPayload}.ts`

---

## 11. 막혔을 때

- 사이드바/리스트에 데이터가 빈 배열로 뜬다 → SQL ambiguous column 의심. `usePowerSync().getAll(sql, params)` try/catch로 확인.
- 화면에 `v1:Aa9xK...` 가 뜬다 → `useDecryptedXxx` 훅을 안 쓰고 raw row를 직접 그렸을 가능성.
- AI 호출이 항상 차단된다 → `hasUndecrypted` 가 true. work에 `encrypted_dek`이 없거나, 일부 row가 복호화 실패. 백필이 끝났는지 확인.
- 로그아웃 후 다시 로그인했는데 본문이 안 보인다 → `decryptStatus: 'no-kek'` 인데 UI가 처리 안 함. 폴백 메시지 추가.
