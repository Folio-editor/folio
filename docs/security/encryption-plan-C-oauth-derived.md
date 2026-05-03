# Plan C — 최종 기획안 (AWS Secrets Manager 채택, DB 마이그레이션 제외)

전제 재확인:

- AWS Secrets Manager 사용 (결정 15: Secrets Manager 채택)
- DB 마이그레이션은 본 기획 범위 밖 (별도 진행)
- 이전 [하드닝안](./encryption-plan-C-hardening.md)의 결함 4건 + 미세 3건 + Folio 환경 정합성 4건을 모두 반영한 단일 진실 문서

---

## 한 줄 결론

KEK는 클라이언트가 매번 도출하고, server_pepper는 AWS Secrets Manager에 보관하며, 클라이언트엔 사용자별 파생값(pepper_user)만 전달한다. 본문은 work 단위 DEK로, PII는 시스템 키로 분리 암호화한다. **운영자가 prod 메인 DB / 백업 / 로그를 봐도 본문은 암호문**이다. 단, AI 처리에 동의한 데이터는 별도 보안 경계인 AI 서버 DB(평문 + 임베딩)에 저장되며, 이 영역은 별도 IAM 권한으로 격리한다.

---

## 1. 키 계층

```
┌──────────────────────────────────────────────────────────────┐
│  server_pepper (32B random)                                   │
│  • AWS Secrets Manager: folio/encryption/pepper               │
│  • 절대 서버 밖으로 안 나감                                   │
│  • Spring 메모리에서만 사용 후 즉시 폐기                      │
└──────────────────────────────────────────────────────────────┘
                │
                ├── HKDF(IKM=server_pepper, salt=google_sub,
                │        info="folio-pepper-user-v1")
                │
                ▼
┌──────────────────────────────────────────────────────────────┐
│  pepper_user (사용자별 파생값)                                │
│  • Spring이 로그인 응답에 포함하여 클라이언트에 전달          │
│  • 클라이언트의 safeStorage / IndexedDB에 캐시                │
└──────────────────────────────────────────────────────────────┘
                │
                ├── HKDF(IKM=pepper_user, salt=user_salt,
                │        info="folio-kek-v1:" + google_sub)
                │
                ▼
┌──────────────────────────────────────────────────────────────┐
│  KEK (사용자 마스터 암호화 키)                                │
│  • 클라이언트 메모리에서 도출                                 │
│  • 데스크탑: safeStorage / 웹: non-extractable CryptoKey      │
└──────────────────────────────────────────────────────────────┘
                │
                │ AES-GCM encrypts
                ▼
┌──────────────────────────────────────────────────────────────┐
│  work_key (DEK, 작품 키)                                      │
│  • 작품 1개당 1개, 클라이언트가 16~32B 랜덤 생성              │
│  • work.encrypted_dek 컬럼에 KEK로 암호화되어 보관            │
│  • 클라이언트 메모리 keyCache에서만 평문                      │
└──────────────────────────────────────────────────────────────┘
                │
                │ AES-GCM encrypts
                ▼
┌──────────────────────────────────────────────────────────────┐
│  본문 (episode.content, plot.content, ...)                    │
│  • IV(12B) || ciphertext || tag(16B) → Base64 → TEXT 컬럼     │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  pii_key (별도 시스템 키)                                     │
│  • HKDF(IKM=server_pepper, salt="pii-system-salt-v1",         │
│         info="folio-pii-v1")                                  │
│  • 모든 사용자의 PII(email, phone)를 같은 키로 암호화         │
│  • Spring 메모리에서만 사용                                   │
└──────────────────────────────────────────────────────────────┘
```

### 키 입력 위치 정리

| 자산 | 위치 | 비고 |
|---|---|---|
| server_pepper | AWS Secrets Manager | 32B random, KMS-encrypted at rest |
| google_sub | Postgres `writer.google_sub` | OAuth 식별자, 평문 |
| user_salt | Postgres `writer.encryption_salt` | 사용자별 16~32B 랜덤, 평문 |
| pepper_user | 클라이언트 safeStorage / IndexedDB | 첫 로그인 시 1회 전달, 회전 시 재발급 |
| KEK | 클라이언트 메모리 + non-extractable handle | 서버 어디에도 저장 안 됨 |
| work_key | Postgres `work.encrypted_dek` (KEK로 암호화) + 클라이언트 메모리 | |
| pii_key | Spring 메모리 (요청 처리 중) | server_pepper에서 도출 |

---

## 2. AWS Secrets Manager 운영 정책 (핵심)

### 시크릿 정의

```
이름: folio/encryption/pepper
값:
{
  "active": "v1",
  "v1": "<base64-32B-random>",
  "v1_created_at": "2026-04-29T00:00:00Z"
}
```

회전 시 v2 추가, active 변경. 마이그레이션 완료 후 v1 폐기.

### IAM 권한 분리

| 역할 | 권한 |
|---|---|
| Spring EC2 IAM Role | `secretsmanager:GetSecretValue` (read-only, folio/encryption/pepper만) |
| DBA 계정 | 권한 없음 |
| DevOps 계정 | `secretsmanager:GetSecretValue` (read-only, 트러블슈팅용) |
| Admin 계정 | 변경/삭제 권한 (단, MFA 필수 + 운영자 2명 합의) |
| 로컬 개발 | 별도 시크릿 `folio/encryption/pepper-dev` |

### Resource Policy (Secrets Manager에 직접 첨부)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyDeleteWithoutMFA",
      "Effect": "Deny",
      "Principal": "*",
      "Action": [
        "secretsmanager:DeleteSecret",
        "secretsmanager:UpdateSecret",
        "secretsmanager:PutSecretValue"
      ],
      "Resource": "*",
      "Condition": {
        "BoolIfExists": { "aws:MultiFactorAuthPresent": "false" }
      }
    }
  ]
}
```

### 영구 소실 방지

- **Secret Replication 활성화**: 주 리전 ap-northeast-2 + 보조 ap-northeast-1 (일본)
- **Recovery Window**: 30일 (삭제 후 복구 가능 기간 최대)
- **CloudTrail 알람**: `DeleteSecret`, `PutSecretValue` 이벤트 발생 시 즉시 SNS 알림
- **오프사이트 백업**: pepper 32B 값을 종이/HSM에 별도 보관, 운영자 2명 합의(2-of-2)로만 접근. 종이는 봉인 후 별도 물리 금고

### 자동 회전

- Secrets Manager 자동 회전 기능 사용 안 함 (pepper 회전은 클라이언트 마이그레이션 동반 필요 — 수동 절차)
- 회전 절차: `decision-log/key-rotation-runbook.md` 별도 문서로 분리

### EC2 IMDSv2 강제

```bash
aws ec2 modify-instance-metadata-options \
  --instance-id i-xxxx \
  --http-tokens required \
  --http-put-response-hop-limit 1
```

추가로 EC2 호스트의 iptables로 169.254.169.254를 일반 사용자 PID에 차단(Spring 프로세스 UID만 허용).

---

## 3. 데이터 흐름

### 3.1 로그인 — pepper_user 발급

```
Client ── POST /api/v1/auth/login (googleIdToken) ──→ Spring
                                                        │
                                                        ├─→ Google OAuth 토큰 검증
                                                        ├─→ Postgres: SELECT writer.encryption_salt, google_sub
                                                        ├─→ Secrets Manager: GetSecretValue(folio/encryption/pepper)
                                                        │   (Spring 인스턴스 캐시: 5분 TTL)
                                                        │
                                                        ├─→ pepper_user = HKDF(
                                                        │     IKM = server_pepper,
                                                        │     salt = google_sub,
                                                        │     info = "folio-pepper-user-v1"
                                                        │   )
                                                        │
Client ←── { sub, salt, pepper_user, pepper_version,    │
            jwt } ─────────────────────────────────────┤
                                                        │
                                                        └─→ server_pepper 메모리 폐기 (byte[] zeroize)
```

**Spring pepper 캐시 정책**:

- 인메모리 5분 TTL (Caffeine 또는 Guava Cache)
- 캐시 만료 시 Secrets Manager 재조회
- Secrets Manager 호출 비용 최소화 (활성 작가 1만 명 × 5분 = 분당 ~33회, 월 $0.05/만건)

**클라이언트 처리**:

- 첫 로그인: pepper_user를 safeStorage(데스크탑) / IndexedDB(웹)에 저장
- 이후 재로그인: pepper_version이 캐시된 버전과 같으면 재사용, 다르면 재발급 + KEK 재도출 + work 키 재암호화 큐 트리거

### 3.2 KEK 도출

```ts
// 데스크탑 (Electron)
const pepperUser = await safeStorage.getItem('pepper_user');
const userSalt = await safeStorage.getItem('user_salt');
const googleSub = currentSession.googleSub;

const keyMaterial = await crypto.subtle.importKey(
  'raw',
  pepperUser,
  { name: 'HKDF' },
  /* extractable */ false,
  ['deriveKey']
);

const kek = await crypto.subtle.deriveKey(
  {
    name: 'HKDF',
    hash: 'SHA-256',
    salt: userSalt,
    info: new TextEncoder().encode(`folio-kek-v1:${googleSub}`),
  },
  keyMaterial,
  { name: 'AES-GCM', length: 256 },
  /* extractable */ false,        // ★ 핵심: 디스크 직접 추출 불가
  ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
);

// 데스크탑: safeStorage에 CryptoKey 저장 불가 → 메모리만, 재시작 시 재도출
// 웹: IndexedDB에 CryptoKey 핸들 저장 가능 (구조화 복제)
await idbStore.put('kek', kek);
```

**중요**:

- `deriveBits` 사용 금지. `deriveKey`로 한 번에 CryptoKey 생성 → raw bytes 메모리 잔존 0
- 데스크탑은 재시작 시 safeStorage에서 pepper_user/user_salt 로드 후 KEK 재도출 (오프라인에서도 동작)
- 웹은 IndexedDB의 CryptoKey 핸들 재사용 (브라우저가 키 자체는 OS 보안 영역에 보관)

### 3.3 새 작품 생성

```ts
const workKey = crypto.getRandomValues(new Uint8Array(32));
const workKeyImported = await crypto.subtle.importKey(
  'raw', workKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']
);

// KEK로 work_key wrap
const iv = crypto.getRandomValues(new Uint8Array(12));
const encryptedDek = await crypto.subtle.encrypt(
  { name: 'AES-GCM', iv },
  kek,
  workKey
);

// 즉시 zeroize
workKey.fill(0);

// SQLite INSERT (PowerSync가 자동 업로드)
await db.execute(
  'INSERT INTO work (id, title, encrypted_dek, dek_iv, dek_version, ...) VALUES (?, ?, ?, ?, ?, ...)',
  [workId, title, base64(encryptedDek), base64(iv), 1, ...]
);

// 메모리 keyCache에 workKey 보관 (CryptoKey 형태)
keyCache.set(workId, workKeyImported);
```

**오프라인 동작**: 모든 단계가 클라이언트 로컬. 서버 호출 0회. PowerSync 큐가 알아서 온라인 시 업로드.

### 3.4 글쓰기

```ts
// TipTap onUpdate, 300~500ms 디바운스 후
const workKey = keyCache.get(workId);
const iv = crypto.getRandomValues(new Uint8Array(12));
const ciphertext = await crypto.subtle.encrypt(
  { name: 'AES-GCM', iv },
  workKey,
  new TextEncoder().encode(plaintext)
);

const payload = base64(concat(iv, new Uint8Array(ciphertext))); // iv || ct || tag

await db.execute(
  'UPDATE episode SET content = ?, updated_at = NOW() WHERE id = ?',
  [payload, episodeId]
);
// PowerSync 큐가 자동으로 /api/v1/sync/upload 호출 → Postgres ciphertext 저장
```

### 3.5 글 읽기

```ts
// useDecryptedEpisode hook (마운트 1회 복호화 + dirty check)
const { data: row } = useQuery(
  'SELECT id, content, updated_at FROM episode WHERE id = ?',
  [episodeId]
);

const [plaintext, setPlaintext] = useState<string | null>(null);
const lastDecryptedAt = useRef<string | null>(null);

useEffect(() => {
  if (!row || row.updated_at === lastDecryptedAt.current) return;

  const workKey = keyCache.get(row.work_id);
  const buf = base64Decode(row.content);
  const iv = buf.slice(0, 12);
  const ct = buf.slice(12);

  crypto.subtle.decrypt({ name: 'AES-GCM', iv }, workKey, ct)
    .then(pt => {
      setPlaintext(new TextDecoder().decode(pt));
      lastDecryptedAt.current = row.updated_at;
    });
}, [row?.id, row?.updated_at]);
```

### 3.6 AI 호출 (RAG 포함)

**현실 인식**: AI 추천 기능은 단순 프록시가 아니라 RAG 구조다. AI 서버는 작가의 평문 데이터(episode 청크 + 임베딩, plan, character, plot, world_note)를 **자체 Postgres에 영구 저장**하고, MCP 도구 7종(`get_plan`, `get_character`, `get_plot`, `list_characters`, `list_world_notes`, `get_world_note`, `search_episode_chunks`)으로 LLM이 RAG 컨텍스트를 구성한다.

→ AI 처리에 동의한 데이터는 **AI 서버 DB에 평문 보관**된다. 이는 보안 약점이 아니라 RAG 기반 AI 추천이 동작하기 위한 기술적 필연이다 (임베딩은 ciphertext에서 의미 추출 불가).

**책임 분리**:

```
[클라이언트]                [Spring]              [AI 서버 (FastAPI + Postgres)]
  평문 (편집 중)              프록시                episode_chunk (평문 + 임베딩)
                            zeroize 후 폐기         plan / character / plot / world_note (평문)
                                                  ↓
                                                  MCP 도구 → LLM RAG
```

**플로우 — episode 인덱싱 (자동)**:

```
Client SQLite (ciphertext)
      ↓ PowerSync upload
Spring SyncService → Postgres (ciphertext)
                  ↓ EpisodeIndexDebouncer (5초)
                  ↓ 평문 episode 필요 → Spring이 클라이언트로부터 받은 평문 사용
AI Server /v1/pipelines/episode → episode_chunk + embedding 저장
```

→ **현재 구조는 깨진다**: SyncService가 ciphertext를 받아 인덱싱을 트리거하면 AI 서버는 ciphertext를 청킹하게 됨. **수정 필요**:

- `SyncService`의 `EpisodeIndexDebouncer.schedule(...)` 호출 **제거**
- 클라이언트가 별도 엔드포인트 `POST /api/v1/ai/index/episode`로 **평문**을 명시적으로 전송
- 작가가 "AI 처리 동의" 약관에 동의한 경우만 호출
- 미동의 작가는 AI 추천 기능 비활성화

**플로우 — AI 리뷰 (사용자 트리거)**:

```ts
// 클라이언트가 평문을 화면에 보유 중 → 명시적으로 Spring 프록시
await fetch('/api/v1/ai/reviews', {
  method: 'POST',
  body: JSON.stringify({ workId, episodeId, content: plaintext })
});
```

Spring 처리:

```java
@PostMapping("/api/v1/ai/reviews")
public ResponseEntity<?> review(@RequestBody AiReviewRequest req) {
  byte[] contentBytes = req.getContent().getBytes(StandardCharsets.UTF_8);
  try {
    AiResult result = aiClient.requestReview(req.getWorkId(), contentBytes);
    return ResponseEntity.ok(result);
  } finally {
    Arrays.fill(contentBytes, (byte) 0);  // 명시적 zeroize
    req.clearContent();                    // request DTO 평문 폐기
  }
}
```

**AI 서버 DB 격리 정책 (결정 18)**:

- **별도 RDS 인스턴스** 또는 같은 인스턴스라도 **별도 DB + 별도 IAM 사용자**
- prod 메인 DB 운영자는 AI DB 접근 권한 없음, 그 반대도 동일
- AI DB는 RDS at-rest 암호화(KMS) 활성화, 자동 백업도 동일 KMS로 암호화
- 작가 탈퇴/AI 동의 철회 시 cascade 삭제 (episode_chunk + embedding + plan/character/plot/world_note 미러)
- AI DB 접근 로그는 CloudTrail로 분리 모니터링

---

## 4. DB 스키마 (마이그레이션은 별도 진행, 본 기획은 컬럼 정의만)

### writer 테이블 추가/변경

```sql
ALTER TABLE writer
  ADD COLUMN encryption_salt    BYTEA NOT NULL,           -- 16~32B 랜덤
  ADD COLUMN encrypted_email    BYTEA,                    -- pii_key로 AES-GCM 암호화
  ADD COLUMN email_iv           BYTEA,                    -- 12B
  ADD COLUMN email_hash         CHAR(64) UNIQUE NOT NULL, -- SHA-256(email + server_pepper)
  ADD COLUMN encrypted_phone    BYTEA,
  ADD COLUMN phone_iv           BYTEA;
-- 기존 email/phone 컬럼은 마이그레이션 후 DROP (별도 진행)
```

**중요**:

- `encryption_salt`는 PowerSync 동기화 대상에서 제외. 매 로그인 시 서버 응답으로 전달
- `email_hash`는 `SHA-256(email_lowercase || server_pepper)` — 무지개 테이블 방어
- `email_iv`, `phone_iv`는 매 INSERT/UPDATE 시 랜덤 생성 (12B)

### work 테이블 추가

```sql
ALTER TABLE work
  ADD COLUMN encrypted_dek BYTEA NOT NULL,
  ADD COLUMN dek_iv        BYTEA NOT NULL,    -- 12B (encrypted_dek 암호화 시 사용)
  ADD COLUMN dek_version   INT   NOT NULL DEFAULT 1;
```

`dek_version` v1 고정. 회전은 후속 단계.

### 암호화 대상 컬럼 (결정 19)

작가 창작 데이터로 분류되는 모든 컬럼은 `TEXT` 그대로 두되 클라이언트가 Base64 ciphertext를 INSERT. SyncService는 pass-through.

| 테이블 | 암호화 컬럼 |
|---|---|
| `episode` | `content` |
| `plot` | `content` |
| `character_note` | `content` |
| `world_note` | `content` |
| `plan_note` | `content` |
| `foreshadow` | `content` |
| `idea_archive` | `content` |
| `plan` | `slogan`, `genres`, `moods`, `target_audience` |
| `character_custom_field` | `field_value` |

→ 모두 work 단위 DEK로 AES-GCM 암호화. plan/character_custom_field는 `work_id`로 work 키와 매핑.

### 본문 외 평문 유지

- 모든 PK/FK (`work_id`, `writer_id`, `episode_id` 등) — PowerSync sync-rules 동작용
- `created_at`, `updated_at`, `sort_order`, `status`, `kind`, `link_type`
- `work.title`, `work.description`, `work.author_name`, `episode.title`, `episode.word_count` (메타데이터)
- `character.name`, `character.gender`, `character.age`, `character.profile_image_url` (캐릭터 식별 메타데이터)
- `foreshadow.title`, `foreshadow.importance`, `plot.title`, `world_note.name`, `plan_note.title`, `character_note.title`, `character_note.kind`
- `character_custom_field.field_name`, `character_tag.*`, `plot_episode_link.*`, `foreshadow_link.link_type`, `foreshadow_link.context_memo`, `idea_archive.tag`

> 메타데이터(제목/이름/태그)는 평문 유지. 사용자에게 "본문/창작 컨텐츠는 암호화, 제목·메타데이터는 평문"이라고 명시.

---

## 5. 책임 분리

### Spring (단순화)

| 엔드포인트 | 책임 |
|---|---|
| `POST /api/v1/auth/login` | Google 토큰 검증, pepper_user 도출, `{sub, salt, pepper_user, pepper_version, jwt}` 응답 |
| `POST /api/v1/sync/upload` | PowerSync CRUD 큐 수신, ciphertext 그대로 Postgres에 INSERT/UPDATE (내용 검증 없음) |
| `POST /api/v1/ai/reviews` | 평문 받아 FastAPI(mTLS) 프록시, 응답 후 메모리 zeroize |
| `POST /api/v1/writers` | 회원가입 시 encryption_salt 생성, email/phone을 pii_key로 암호화 + email_hash 생성 |

**Spring이 절대 하지 않는 것**:

- KEK 저장
- work_key 평문 저장
- 본문 평문 저장
- server_pepper 응답에 포함

### 클라이언트 (frontend/src/shared/crypto/)

| 모듈 | 책임 |
|---|---|
| `kek.ts` | HKDF로 KEK 도출 (deriveKey 1단계) |
| `keyCache.ts` | workId → CryptoKey(workKey) 메모리 맵 |
| `cipher.ts` | AES-256-GCM encrypt/decrypt, IV 랜덤 생성 |
| `kekStorage.ts` | 데스크탑 safeStorage / 웹 IndexedDB 어댑터 |
| `lifecycle.ts` | KEK 라이프사이클 관리 (로그아웃/30일/사용자 전환/pepper 회전) |
| `useLocalWrite` | content 쓰기 직전 encrypt + TipTap 300~500ms 디바운스 |
| `useDecryptedEpisode` | 마운트 1회 복호화 + dirty check + watch push 재복호화 |

---

## 6. 보안 모델

### 6.1 평문 존재 위치

| 위치 | 본문 평문 | KEK 평문 | server_pepper | pii_key | pepper_user |
|---|---|---|---|---|---|
| 작가 클라이언트 메모리 | O (편집 중) | O (CryptoKey, non-extractable) | X | X | O (캐시) |
| 데스크탑 safeStorage | X | X (재시작 시 재도출) | X | X | O |
| 웹 IndexedDB | X | X (non-extractable handle) | X | X | O |
| 작가 로컬 SQLite | X (ciphertext) | X | X | X | X |
| Spring 메모리 | △ (AI 프록시 시점만, 직후 zeroize) | X | △ (5분 캐시) | △ (PII 처리 시점만) | △ (로그인 응답 시점만) |
| **prod 메인 Postgres** | **X (ciphertext)** | X | X | X | X |
| PowerSync | X | X | X | X | X |
| **AI 서버 Postgres** (별도 DB/IAM) | **O (RAG에 필요, AI 동의자만)** | X | X | X | X |
| AWS Secrets Manager | X | X | O (KMS-encrypted at rest) | X | X |
| CloudTrail / 메인 DB 백업 / Loki | X | X | X | X | X |
| AI DB 백업 | O (RDS at-rest 암호화 + KMS) | X | X | X | X |

> **메인 DB와 AI DB는 별도 보안 경계**. 운영자가 메인 DB만 봐선 본문 못 봄. AI DB 접근은 별도 IAM, 별도 CloudTrail 모니터링.

### 6.2 위협 매트릭스

| 시나리오 | 방어 | 비고 |
|---|---|---|
| 운영자 prod 메인 DB SELECT | ✅ 안전 | 본문/이메일/폰 모두 암호문 |
| 메인 Postgres 백업 유출 | ✅ 안전 | 동일 |
| 메인 RDS 스냅샷 유출 | ✅ 안전 | 동일 |
| Loki/로그 파일 유출 | ✅ 안전 | 본문은 항상 ciphertext, request body는 마스킹 |
| **AI DB 운영자 SELECT (메인 DB 권한자)** | ✅ 안전 | 별도 IAM, 메인 DB 권한으론 AI DB 접근 불가 |
| **AI DB 운영자 SELECT (AI DB 권한자)** | ❌ 본문 노출 | RAG 한계 — AI 동의자 데이터만, 동의 철회 시 cascade 삭제 |
| **AI DB 백업/스냅샷 유출** | ⚠️ KMS 키 동시 유출 시 노출 | RDS at-rest 암호화로 보강, KMS는 별도 분리 |
| TLS 깨진 환경 (회사망 SSL 인터셉트) | ✅ 안전 | pepper_user만 노출, blast radius 1 user |
| 클라이언트 디바이스 도난 + OS 잠금 뚫림 | ⚠️ 그 사용자만 노출 | blast radius 1 |
| 클라이언트 디바이스 도난 + OS 잠금 유지 | ✅ 안전 | safeStorage / non-extractable CryptoKey |
| XSS 1방 (웹) | ⚠️ encrypt/decrypt 호출 가능, 키 추출 불가 | CSP로 보강 |
| Spring 환경변수 유출 | ✅ 안전 | 환경변수에 pepper 없음 |
| Spring + Secrets Manager IAM Role 동시 탈취 | ❌ 본문 노출 | E2EE 한계, 모든 모델 공통 |
| **메인 DB + AI DB 운영자 동시 탈취** | ❌ 모든 동의자 본문 노출 | 블래스트 반경 = AI 동의자 전체. 별도 IAM으로 비용 증가 |
| EC2 IMDSv2 우회 시도 | ✅ 안전 | HttpTokens=required로 차단 |
| Spring RCE → 메모리 덤프 | ⚠️ AI 호출 중 작가 본문 + 로그인 중 작가 pepper_user 노출 | 5분 캐시 윈도우 |
| Google OAuth 토큰 탈취 | ✅ 안전 | sub만으론 KEK 도출 불가 |
| pepper 영구 소실 (계정 탈취/실수) | ✅ 다중 리전 + 30일 복구 + 종이 백업 | 결함 4 보강 완료 |
| **AI 미동의 작가 본문** | ✅ 완전 안전 | AI DB로 안 들어감, 메인 DB만 통과 = ciphertext |

---

## 7. 결정사항 (최종)

| # | 항목 | 결정 |
|---|---|---|
| 1 | KEK 보관 (데스크탑) | Electron safeStorage에 pepper_user/user_salt만 보관, KEK는 메모리에서 매번 재도출 |
| 2 | KEK 보관 (웹) | non-extractable CryptoKey를 IndexedDB 핸들로 저장 |
| 3 | useQuery 복호화 | watch는 ciphertext, 마운트 1회 복호화 + dirty check + TipTap 300~500ms 디바운스 |
| 4 | AI 추천 캐시 | localStorage 저장 시 work 키로 암호화 후 저장 |
| 5 | dek_version | v1 고정, 회전 정책은 후속 단계 |
| 6 | pepper 보관소 | **AWS Secrets Manager** `folio/encryption/pepper` |
| 7 | pepper 클라이언트 전송 | server_pepper 절대 노출 금지. `pepper_user = HKDF(IKM=pepper, salt=sub, info="folio-pepper-user-v1")`만 전달 |
| 8 | 마이그레이션 방식 | (본 기획 범위 밖, 별도 결정) |
| 9 | PII 보호 | `pii_key = HKDF(IKM=pepper, salt="pii-system-salt-v1", info="folio-pii-v1")`로 email/phone 암호화 + `email_hash = SHA-256(email_lowercase + pepper)` 인덱스 |
| 10 | pepper 분실 대비 | Secrets Manager 다중 리전 복제(ap-northeast-2 ↔ ap-northeast-1) + Resource Policy로 DeleteSecret/UpdateSecret/PutSecretValue MFA 강제 + Recovery Window 30일 + 오프사이트 종이 백업 (운영자 2명 합의) + CloudTrail 이상 호출 SNS 알람 |
| 11 | KEK 라이프사이클 | 로그아웃 시 즉시 삭제 / 비활성 30일 자동 삭제 / 사용자 전환 시 삭제 / pepper_version 변경 감지 시 즉시 KEK 재도출 + work 키 재암호화 큐 트리거 |
| 12 | HKDF 입력 매핑 | KEK: IKM=pepper_user, salt=user_salt, info="folio-kek-v1:" + sub. pepper_user: IKM=server_pepper, salt=sub, info="folio-pepper-user-v1". pii_key: IKM=server_pepper, salt="pii-system-salt-v1", info="folio-pii-v1". 코드 리뷰 시 인자 자리 검증 필수 |
| 13 | 웹 KEK 도출 코드 | `crypto.subtle.deriveKey(..., extractable=false, ...)` 1단계 사용. `deriveBits` 사용 시 직후 `Uint8Array.fill(0)` 의무 |
| 14 | migration_status / encryption_salt | PowerSync 동기화 대상에서 제외. salt는 매 로그인 응답으로 전달 |
| 15 | EC2 메타데이터 | IMDSv2 강제 (`HttpTokens=required`) + iptables로 일반 사용자 PID의 169.254.169.254 차단 |
| 16 | Spring pepper 캐시 | 인메모리 5분 TTL. 만료 시 Secrets Manager 재조회. byte[] 사용 + `Arrays.fill(arr, (byte)0)` 명시적 zeroize |
| 17 | 로깅 마스킹 | request body의 `pepper`, `pepper_user`, `salt`, `googleIdToken`, `content` 필드 자동 마스킹 (Spring Logback ConverterPattern + Sentry beforeSend) |
| 18 | AI 서버 DB 격리 | AI 서버 Postgres는 RAG 동작 위해 평문 보관 불가피. 별도 RDS 인스턴스(또는 별도 DB + 별도 IAM) + RDS at-rest 암호화(KMS) + 메인 DB 권한자 접근 차단 + 별도 CloudTrail. 작가 탈퇴/동의 철회 시 episode_chunk·embedding·plan/character/plot/world_note 미러 cascade 삭제. EpisodeIndexDebouncer는 SyncService에서 분리하고 AI 동의자가 명시 트리거하는 별도 엔드포인트로 이전 |
| 19 | 암호화 대상 컬럼 | `episode.content` / `plot.content` / `character_note.content` / `world_note.content` / `plan_note.content` / `foreshadow.content` / `idea_archive.content` / `plan.slogan` / `plan.genres` / `plan.moods` / `plan.target_audience` / `character_custom_field.field_value`. 메타데이터(제목/이름/태그 등)는 평문 유지하며 사용자에게 명시 |

---

## 8. 책임 구역과 비책임 구역

### 본 기획안의 책임 구역

- KEK 도출 알고리즘 및 클라이언트/서버 분리 모델
- AWS Secrets Manager 운영 정책 및 IAM 분리
- 클라이언트 crypto/ 모듈 인터페이스
- DB 스키마 추가 컬럼 정의
- 보안 위협 모델 및 방어책
- 코드 리뷰 체크리스트

### 본 기획안의 비책임 구역 (별도 결정/문서)

- DB 마이그레이션 (기존 평문 데이터 → 암호문)
- 기존 사용자 데이터 처리 정책 (활성/비활성)
- pg_dump 등 백업 인프라 구축
- pepper 회전 절차 runbook
- Phase별 배포 일정 및 롤백 계획

---

## 9. 코드 리뷰 체크리스트 (PR 시 자동 검증)

| 항목 | 확인 방법 |
|---|---|
| HKDF 인자 자리 | `crypto.subtle.deriveKey({salt, info, ...})` 호출이 결정 12 매핑 따르는지 |
| `/api/v1/auth/login` 응답 본문 | `server_pepper` / `pepper` 필드 있으면 거부, `pepper_user`만 허용 |
| 웹 KEK import 형식 | `subtle.deriveKey(..., extractable=false, ...)` 누락 시 거부 |
| Secrets Manager IAM | Resource Policy에 MFA-deny 있는지, replication 활성 상태인지 |
| EC2 IMDSv2 | `HttpTokens=required` 인지 |
| 로그 마스킹 | request body에서 민감 필드 자동 마스킹 룰 동작 확인 |
| Spring AI 프록시 zeroize | `finally` 블록에서 `Arrays.fill(byte[], (byte)0)` 호출 여부 |
| `deriveBits` 사용 시 zeroize | 직후 `new Uint8Array(buf).fill(0)` 호출 여부 |
| `encryption_salt` PowerSync 제외 | sync-rules.yaml의 writer 테이블 SELECT에 `encryption_salt` 미포함 |
| TipTap 디바운스 | onUpdate 콜백에 300~500ms debounce 적용 |
| pii_key 도출 코드 | server_pepper 직접 사용 금지, HKDF로 도출 |
| email_hash UNIQUE | DB 제약 + 등록 시 충돌 핸들링 |

---

## 10. 한 줄 요약

KMS 폐기, KEK는 클라이언트가 매번 도출. server_pepper는 AWS Secrets Manager에 보관하되 **사용자별 파생값(pepper_user)만** 클라이언트에 전달. 본문은 work 단위 DEK로, PII는 별도 시스템 키로 분리 암호화. KEK는 데스크탑에선 메모리에서 재도출, 웹에선 non-extractable CryptoKey로 IndexedDB에 보관. **메인 DB는 운영자가 봐도 ciphertext, AI DB는 RAG 동작 위해 평문이지만 별도 IAM 영역으로 격리**. 4요건과 보안 모델(정직한 약속)을 동시 충족하는 최종안.

---

## 11. 이 기획안에서 백엔드 구현자에게 명시적으로 요구할 것

1. **`/api/v1/auth/login` 응답에 `server_pepper`를 포함하지 말 것** — `pepper_user`만 보낼 것 (결정 7)
2. **`/api/v1/sync/upload`는 ciphertext 검증 금지** — pass-through만 (결정 5의 흐름)
3. **`/api/v1/ai/reviews` 응답 후 `Arrays.fill` 명시적 zeroize** — Java GC 의존 금지 (결정 16)
4. **Secrets Manager 호출은 5분 인메모리 캐시** — 매 요청 호출 금지 (비용 + 지연)
5. **pii_key 도출 후 byte[] zeroize** — PII 처리 직후 (결정 12)
6. **HKDF 인자 자리는 결정 12 매핑 그대로** — IKM/salt/info 자리 바뀌면 보안 약화
7. **`SyncService.processEpisode`에서 `EpisodeIndexDebouncer.schedule(...)` 호출 제거** (결정 18) — content가 ciphertext가 되므로 자동 인덱싱 불가. AI 동의자가 명시 트리거하는 신규 엔드포인트(예: `POST /api/v1/ai/index/episode`)로 이전, 평문은 클라이언트가 직접 전송
8. **AI 서버 DB(Postgres) 별도 IAM 격리** (결정 18) — 메인 DB 운영자 권한으로 AI DB 접근 불가. 별도 RDS 인스턴스 권장. RDS at-rest 암호화 + 별도 CloudTrail
9. **AI 동의 철회 / 작가 탈퇴 시 cascade 삭제** (결정 18) — AI DB의 episode_chunk + embedding + plan/character/plot/world_note 미러 모두 제거하는 운영 API 보유

이 9건이 PR에 반영되어 있는지가 머지 게이트.
