Plan C — 최종 기획안 (AWS Secrets Manager 채택, DB 마이그레이션 제외)
======================================================

> ⚠ **상태 변경 (2026-05-05) — Vault Transit Engine 채택**
> 본 Plan C 옵션 1 ("운영자도 본문 못 봄") 은 AI 자동 인덱싱·MCP·요약 등 AI 자동 백그라운드 처리와
> 양립 불가능함이 확인되어 **envelope encryption 모델**로 전환.
> AWS KMS 는 교육기관 EC2 외부 방화벽으로 도달 불가 → **HashiCorp Vault Transit Engine
> (self-hosted, docker-compose 컨테이너)** 채택. 보안 모델은 KMS 와 동일.
> 변경 사유:
> - AI 인덱싱 트리거가 본질적으로 막힘 (서버는 평문 못 봄)
> - 작가 명시 트리거는 UX 부담 (오프라인 퍼스트 정합 깨짐)
> - 클라이언트 임베딩(Transformers.js) 은 알파 단계 인프라 부담 큼
> - AWS KMS · Secrets Manager · API 전반: EC2 outbound 차단으로 사용 불가
> 신규 모델 (Vault Transit):
> - DB 는 ciphertext-only 유지 (외부 해커·DB 침해 보호)
> - Folio 운영팀 (Vault unseal key 보유자) 은 AI 처리 시점에 한정 복호화 가능 (Notion·Google Docs 모델)
> - 작가에게 개인정보처리방침에 명시
> - **약속 변경**: 작품 생성 순간 raw work_key 가 서버 메모리를 한 번 통과 (envelope encryption 본질적 trade-off)
> 본 문서의 클라이언트 KEK·work_key 흐름은 그대로 유지하고, 서버 측 별도 wrap 키
> (`work.server_encrypted_dek` BYTEA, Vault Transit 으로 wrap) 만 추가.
>
> 상세: `docs/security/vault-integration.md`, `docs/ai-agent-transition-draft-v2.md`.

전제 재확인:

*   AWS Secrets Manager 사용 (결정 15: Secrets Manager 채택)
*   DB 마이그레이션은 본 기획 범위 밖 (별도 진행)
*   이전 하드닝안의 결함 4건 + 미세 3건 + Folio 환경 정합성 4건을 모두 반영한 단일 진실 문서
*   **(2026-05 갱신) KMS 모델로 전환 — 위 박스 참조**

* * *

한 줄 결론
------

KEK는 클라이언트가 매번 도출하고, server\_pepper는 AWS Secrets Manager에 보관하며, 클라이언트엔 사용자별 파생값(pepper\_user)만 전달한다. 본문은 work 단위 DEK로, PII는 시스템 키로 분리 암호화한다. 4요건과 보안 모델을 동시 충족하는 최종안.

* * *

1\. 키 계층
--------

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
    

### 키 입력 위치 정리

| 자산 | 위치 | 비고 |
| --- | --- | --- |
| server\_pepper | AWS Secrets Manager | 32B random, KMS-encrypted at rest |
| google\_sub | Postgres `writer.google_sub` | OAuth 식별자, 평문 |
| user\_salt | Postgres `writer.encryption_salt` | 사용자별 16~32B 랜덤, 평문 |
| pepper\_user | 클라이언트 safeStorage / IndexedDB | 첫 로그인 시 1회 전달, 회전 시 재발급 |
| KEK | 클라이언트 메모리 + non-extractable handle | 서버 어디에도 저장 안 됨 |
| work\_key | Postgres `work.encrypted_dek` (KEK로 암호화) + 클라이언트 메모리 |  |
| pii\_key | Spring 메모리 (요청 처리 중) | server\_pepper에서 도출 |

* * *

2\. AWS Secrets Manager 운영 정책 (핵심)
----------------------------------

### 시크릿 정의

    이름: folio/encryption/pepper
    값:
    {
      "active": "v1",
      "v1": "<base64-32B-random>",
      "v1_created_at": "2026-04-29T00:00:00Z"
    }
    

회전 시 v2 추가, active 변경. 마이그레이션 완료 후 v1 폐기.

### IAM 권한 분리

| 역할 | 권한 |
| --- | --- |
| Spring EC2 IAM Role | `secretsmanager:GetSecretValue` (read-only, folio/encryption/pepper만) |
| DBA 계정 | 권한 없음 |
| DevOps 계정 | `secretsmanager:GetSecretValue` (read-only, 트러블슈팅용) |
| Admin 계정 | 변경/삭제 권한 (단, MFA 필수 + 운영자 2명 합의) |
| 로컬 개발 | 별도 시크릿 `folio/encryption/pepper-dev` |

### Resource Policy (Secrets Manager에 직접 첨부)

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
    

### 영구 소실 방지

*   **Secret Replication 활성화**: 주 리전 ap-northeast-2 + 보조 ap-northeast-1 (일본)
*   **Recovery Window**: 30일 (삭제 후 복구 가능 기간 최대)
*   **CloudTrail 알람**: `DeleteSecret`, `PutSecretValue` 이벤트 발생 시 즉시 SNS 알림
*   **오프사이트 백업**: pepper 32B 값을 종이/HSM에 별도 보관, 운영자 2명 합의(2-of-2)로만 접근. 종이는 봉인 후 별도 물리 금고

### 자동 회전

*   Secrets Manager 자동 회전 기능 사용 안 함 (pepper 회전은 클라이언트 마이그레이션 동반 필요 — 수동 절차)
*   회전 절차: `decision-log/key-rotation-runbook.md` 별도 문서로 분리

### EC2 IMDSv2 강제

    aws ec2 modify-instance-metadata-options \
      --instance-id i-xxxx \
      --http-tokens required \
      --http-put-response-hop-limit 1
    

추가로 EC2 호스트의 iptables로 169.254.169.254를 일반 사용자 PID에 차단(Spring 프로세스 UID만 허용).

* * *

3\. 데이터 흐름
----------

### 3.1 로그인 — pepper\_user 발급

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
    

**Spring pepper 캐시 정책**:

*   인메모리 5분 TTL (Caffeine 또는 Guava Cache)
*   캐시 만료 시 Secrets Manager 재조회
*   Secrets Manager 호출 비용 최소화 (활성 작가 1만 명 × 5분 = 분당 ~33회, 월 $0.05/만건)

**클라이언트 처리**:

*   첫 로그인: pepper\_user를 safeStorage(데스크탑) / IndexedDB(웹)에 저장
*   이후 재로그인: pepper\_version이 캐시된 버전과 같으면 재사용, 다르면 재발급 + KEK 재도출 + work 키 재암호화 큐 트리거

### 3.2 KEK 도출

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
    

**중요**:

*   `deriveBits` 사용 금지. `deriveKey`로 한 번에 CryptoKey 생성 → raw bytes 메모리 잔존 0
*   데스크탑은 재시작 시 safeStorage에서 pepper\_user/user\_salt 로드 후 KEK 재도출 (오프라인에서도 동작)
*   웹은 IndexedDB의 CryptoKey 핸들 재사용 (브라우저가 키 자체는 OS 보안 영역에 보관)

### 3.3 새 작품 생성

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
    

**오프라인 동작**: 모든 단계가 클라이언트 로컬. 서버 호출 0회. PowerSync 큐가 알아서 온라인 시 업로드.

### 3.4 글쓰기

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
    

### 3.5 글 읽기

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
    

### 3.6 AI 호출

    // 클라이언트가 평문을 화면에 보유 중 → 그대로 Spring 프록시
    await fetch('/api/v1/ai/reviews', {
      method: 'POST',
      body: JSON.stringify({ workId, episodeId, content: plaintext })
    });
    

Spring 처리:

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
    

* * *

4\. DB 스키마 (마이그레이션은 별도 진행, 본 기획은 컬럼 정의만)
----------------------------------------

### writer 테이블 추가/변경

    ALTER TABLE writer
      ADD COLUMN encryption_salt    BYTEA NOT NULL,           -- 16~32B 랜덤
      ADD COLUMN encrypted_email    BYTEA,                    -- pii_key로 AES-GCM 암호화
      ADD COLUMN email_iv           BYTEA,                    -- 12B
      ADD COLUMN email_hash         CHAR(64) UNIQUE NOT NULL, -- SHA-256(email + server_pepper)
      ADD COLUMN encrypted_phone    BYTEA,
      ADD COLUMN phone_iv           BYTEA;
    -- 기존 email/phone 컬럼은 마이그레이션 후 DROP (별도 진행)
    

**중요**:

*   `encryption_salt`는 PowerSync 동기화 대상에서 제외. 매 로그인 시 서버 응답으로 전달
*   `email_hash`는 `SHA-256(email_lowercase || server_pepper)` — 무지개 테이블 방어
*   `email_iv`, `phone_iv`는 매 INSERT/UPDATE 시 랜덤 생성 (12B)

### work 테이블 추가

    ALTER TABLE work
      ADD COLUMN encrypted_dek BYTEA NOT NULL,
      ADD COLUMN dek_iv        BYTEA NOT NULL,    -- 12B (encrypted_dek 암호화 시 사용)
      ADD COLUMN dek_version   INT   NOT NULL DEFAULT 1;
    

`dek_version` v1 고정. 회전은 후속 단계.

### 본문 컬럼 (변경 없음)

`episode.content`, `plot.content`, `character_note.content`, `world_note.content`, `plan_note.content`, `foreshadow.content`, `idea_archive.content`는 모두 `TEXT` 그대로 유지. 클라이언트가 Base64 ciphertext를 그대로 INSERT.

### 본문 외 평문 유지

*   모든 PK/FK (`work_id`, `writer_id`, `episode_id` 등) — PowerSync sync-rules 동작용
*   `created_at`, `updated_at`, `sort_order`, `status`
*   `work.title`, `work.description`, `episode.title`, `episode.word_count` (메타데이터)

* * *

5\. 책임 분리
---------

### Spring (단순화)

| 엔드포인트 | 책임 |
| --- | --- |
| `POST /api/v1/auth/login` | Google 토큰 검증, pepper\_user 도출, `{sub, salt, pepper_user, pepper_version, jwt}` 응답 |
| `POST /api/v1/sync/upload` | PowerSync CRUD 큐 수신, ciphertext 그대로 Postgres에 INSERT/UPDATE (내용 검증 없음) |
| `POST /api/v1/ai/reviews` | 평문 받아 FastAPI(mTLS) 프록시, 응답 후 메모리 zeroize |
| `POST /api/v1/writers` | 회원가입 시 encryption\_salt 생성, email/phone을 pii\_key로 암호화 + email\_hash 생성 |

**Spring이 절대 하지 않는 것**:

*   KEK 저장
*   work\_key 평문 저장
*   본문 평문 저장
*   server\_pepper 응답에 포함

### 클라이언트 (frontend/src/shared/crypto/)

| 모듈 | 책임 |
| --- | --- |
| `kek.ts` | HKDF로 KEK 도출 (deriveKey 1단계) |
| `keyCache.ts` | workId → CryptoKey(workKey) 메모리 맵 |
| `cipher.ts` | AES-256-GCM encrypt/decrypt, IV 랜덤 생성 |
| `kekStorage.ts` | 데스크탑 safeStorage / 웹 IndexedDB 어댑터 |
| `lifecycle.ts` | KEK 라이프사이클 관리 (로그아웃/30일/사용자 전환/pepper 회전) |
| `useLocalWrite` | content 쓰기 직전 encrypt + TipTap 300~500ms 디바운스 |
| `useDecryptedEpisode` | 마운트 1회 복호화 + dirty check + watch push 재복호화 |

* * *

6\. 보안 모델
---------

### 6.1 평문 존재 위치

| 위치 | 본문 평문 | KEK 평문 | server\_pepper | pii\_key | pepper\_user |
| --- | --- | --- | --- | --- | --- |
| 작가 클라이언트 메모리 | O (편집 중) | O (CryptoKey, non-extractable) | X | X | O (캐시) |
| 데스크탑 safeStorage | X | X (재시작 시 재도출) | X | X | O |
| 웹 IndexedDB | X | X (non-extractable handle) | X | X | O |
| 작가 로컬 SQLite | X (ciphertext) | X | X | X | X |
| Spring 메모리 | △ (AI 프록시 시점만, 직후 zeroize) | X | △ (5분 캐시) | △ (PII 처리 시점만) | △ (로그인 응답 시점만) |
| Postgres | X | X | X | X | X |
| PowerSync | X | X | X | X | X |
| AWS Secrets Manager | X | X | O (KMS-encrypted at rest) | X | X |
| CloudTrail / 백업 / Loki | X | X | X | X | X |

### 6.2 위협 매트릭스

| 시나리오 | 방어 | 비고 |
| --- | --- | --- |
| 운영자 prod DB SELECT | ✅ 안전 | 본문/이메일/폰 모두 암호문 |
| Postgres 백업 유출 | ✅ 안전 | 동일 |
| RDS 스냅샷 유출 | ✅ 안전 | 동일 |
| Loki/로그 파일 유출 | ✅ 안전 | 본문은 항상 ciphertext, request body는 마스킹 |
| TLS 깨진 환경 (회사망 SSL 인터셉트) | ✅ 안전 | pepper\_user만 노출, blast radius 1 user |
| 클라이언트 디바이스 도난 + OS 잠금 뚫림 | ⚠️ 그 사용자만 노출 | blast radius 1 |
| 클라이언트 디바이스 도난 + OS 잠금 유지 | ✅ 안전 | safeStorage / non-extractable CryptoKey |
| XSS 1방 (웹) | ⚠️ encrypt/decrypt 호출 가능, 키 추출 불가 | CSP로 보강 |
| Spring 환경변수 유출 | ✅ 안전 | 환경변수에 pepper 없음 |
| Spring + Secrets Manager IAM Role 동시 탈취 | ❌ 본문 노출 | E2EE 한계, 모든 모델 공통 |
| EC2 IMDSv2 우회 시도 | ✅ 안전 | HttpTokens=required로 차단 |
| Spring RCE → 메모리 덤프 | ⚠️ AI 호출 중 작가 본문 + 로그인 중 작가 pepper\_user 노출 | 5분 캐시 윈도우 |
| Google OAuth 토큰 탈취 | ✅ 안전 | sub만으론 KEK 도출 불가 |
| pepper 영구 소실 (계정 탈취/실수) | ✅ 다중 리전 + 30일 복구 + 종이 백업 | 결함 4 보강 완료 |

* * *

7\. 결정사항 (최종)
-------------

| # | 항목 | 결정 |
| --- | --- | --- |
| 1 | KEK 보관 (데스크탑) | Electron safeStorage에 pepper\_user/user\_salt만 보관, KEK는 메모리에서 매번 재도출 |
| 2 | KEK 보관 (웹) | non-extractable CryptoKey를 IndexedDB 핸들로 저장 |
| 3 | useQuery 복호화 | watch는 ciphertext, 마운트 1회 복호화 + dirty check + TipTap 300~500ms 디바운스 |
| 4 | AI 추천 캐시 | localStorage 저장 시 work 키로 암호화 후 저장 |
| 5 | dek\_version | v1 고정, 회전 정책은 후속 단계 |
| 6 | pepper 보관소 | **AWS Secrets Manager** `folio/encryption/pepper` |
| 7 | pepper 클라이언트 전송 | server\_pepper 절대 노출 금지. `pepper_user = HKDF(IKM=pepper, salt=sub, info="folio-pepper-user-v1")`만 전달 |
| 8 | 마이그레이션 방식 | (본 기획 범위 밖, 별도 결정) |
| 9 | PII 보호 | `pii_key = HKDF(IKM=pepper, salt="pii-system-salt-v1", info="folio-pii-v1")`로 email/phone 암호화 + `email_hash = SHA-256(email_lowercase + pepper)` 인덱스 |
| 10 | pepper 분실 대비 | Secrets Manager 다중 리전 복제(ap-northeast-2 ↔ ap-northeast-1) + Resource Policy로 DeleteSecret/UpdateSecret/PutSecretValue MFA 강제 + Recovery Window 30일 + 오프사이트 종이 백업 (운영자 2명 합의) + CloudTrail 이상 호출 SNS 알람 |
| 11 | KEK 라이프사이클 | 로그아웃 시 즉시 삭제 / 비활성 30일 자동 삭제 / 사용자 전환 시 삭제 / pepper\_version 변경 감지 시 즉시 KEK 재도출 + work 키 재암호화 큐 트리거 |
| 12 | HKDF 입력 매핑 | KEK: IKM=pepper\_user, salt=user\_salt, info="folio-kek-v1:" + sub. pepper\_user: IKM=server\_pepper, salt=sub, info="folio-pepper-user-v1". pii\_key: IKM=server\_pepper, salt="pii-system-salt-v1", info="folio-pii-v1". 코드 리뷰 시 인자 자리 검증 필수 |
| 13 | 웹 KEK 도출 코드 | `crypto.subtle.deriveKey(..., extractable=false, ...)` 1단계 사용. `deriveBits` 사용 시 직후 `Uint8Array.fill(0)` 의무 |
| 14 | migration\_status / encryption\_salt | PowerSync 동기화 대상에서 제외. salt는 매 로그인 응답으로 전달 |
| 15 | EC2 메타데이터 | IMDSv2 강제 (`HttpTokens=required`) + iptables로 일반 사용자 PID의 169.254.169.254 차단 |
| 16 | Spring pepper 캐시 | 인메모리 5분 TTL. 만료 시 Secrets Manager 재조회. byte\[\] 사용 + `Arrays.fill(arr, (byte)0)` 명시적 zeroize |
| 17 | 로깅 마스킹 | request body의 `pepper`, `pepper_user`, `salt`, `googleIdToken`, `content` 필드 자동 마스킹 (Spring Logback ConverterPattern + Sentry beforeSend) |

* * *

8\. 책임 구역과 비책임 구역
-----------------

### 본 기획안의 책임 구역

*   KEK 도출 알고리즘 및 클라이언트/서버 분리 모델
*   AWS Secrets Manager 운영 정책 및 IAM 분리
*   클라이언트 crypto/ 모듈 인터페이스
*   DB 스키마 추가 컬럼 정의
*   보안 위협 모델 및 방어책
*   코드 리뷰 체크리스트

### 본 기획안의 비책임 구역 (별도 결정/문서)

*   DB 마이그레이션 (기존 평문 데이터 → 암호문)
*   기존 사용자 데이터 처리 정책 (활성/비활성)
*   pg\_dump 등 백업 인프라 구축
*   pepper 회전 절차 runbook
*   Phase별 배포 일정 및 롤백 계획

* * *

9\. 코드 리뷰 체크리스트 (PR 시 자동 검증)
----------------------------

| 항목 | 확인 방법 |
| --- | --- |
| HKDF 인자 자리 | `crypto.subtle.deriveKey({salt, info, ...})` 호출이 결정 12 매핑 따르는지 |
| `/api/v1/auth/login` 응답 본문 | `server_pepper` / `pepper` 필드 있으면 거부, `pepper_user`만 허용 |
| 웹 KEK import 형식 | `subtle.deriveKey(..., extractable=false, ...)` 누락 시 거부 |
| Secrets Manager IAM | Resource Policy에 MFA-deny 있는지, replication 활성 상태인지 |
| EC2 IMDSv2 | `HttpTokens=required` 인지 |
| 로그 마스킹 | request body에서 민감 필드 자동 마스킹 룰 동작 확인 |
| Spring AI 프록시 zeroize | `finally` 블록에서 `Arrays.fill(byte[], (byte)0)` 호출 여부 |
| `deriveBits` 사용 시 zeroize | 직후 `new Uint8Array(buf).fill(0)` 호출 여부 |
| `encryption_salt` PowerSync 제외 | sync-rules.yaml의 writer 테이블 SELECT에 `encryption_salt` 미포함 |
| TipTap 디바운스 | onUpdate 콜백에 300~500ms debounce 적용 |
| pii\_key 도출 코드 | server\_pepper 직접 사용 금지, HKDF로 도출 |
| email\_hash UNIQUE | DB 제약 + 등록 시 충돌 핸들링 |

* * *

10\. 한 줄 요약
-----------

KMS 폐기, KEK는 클라이언트가 매번 도출. server\_pepper는 AWS Secrets Manager에 보관하되 **사용자별 파생값(pepper\_user)만** 클라이언트에 전달. 본문은 work 단위 DEK로, PII는 별도 시스템 키로 분리 암호화. KEK는 데스크탑에선 메모리에서 재도출, 웹에선 non-extractable CryptoKey로 IndexedDB에 보관. 4요건과 보안 모델을 동시 충족하는 최종안.

* * *

11\. 이 기획안에서 백엔드 구현자에게 명시적으로 요구할 것
----------------------------------

1.  **`/api/v1/auth/login` 응답에 `server_pepper`를 포함하지 말 것** — `pepper_user`만 보낼 것 (결정 7)
2.  **`/api/v1/sync/upload`는 ciphertext 검증 금지** — pass-through만 (결정 5의 흐름)
3.  **`/api/v1/ai/reviews` 응답 후 `Arrays.fill` 명시적 zeroize** — Java GC 의존 금지 (결정 16)
4.  **Secrets Manager 호출은 5분 인메모리 캐시** — 매 요청 호출 금지 (비용 + 지연)
5.  **pii\_key 도출 후 byte\[\] zeroize** — PII 처리 직후 (결정 12)
6.  **HKDF 인자 자리는 결정 12 매핑 그대로** — IKM/salt/info 자리 바뀌면 보안 약화

이 6건이 PR에 반영되어 있는지가 머지 게이트.

* * *

12\. 다음 행동
----------

본 최종 기획안을 백엔드 구현자에게 회신하면 됩니다. 회신문 초안 작성이 필요하시면 말씀해주시고, 구현 단계로 들어갈 거면 어떤 모듈(예: Spring `WriterService` + `AuthController`, 또는 클라이언트 `crypto/kek.ts` + `crypto/cipher.ts`)부터 같이 들어갈지 알려주세요.