# Folio 암호화 아키텍처 — 초보자 가이드

> 작성일: 2026-05-06
> 대상: 신규 합류 개발자, 보안 개념을 처음 접하는 팀원, 운영 담당자
> 전제 지식: 대칭키 암호화 (AES) 가 "같은 키로 잠그고 푸는 자물쇠" 라는 정도

이 문서는 Folio 가 **사용자의 원고 데이터를 어떻게 보호하는지**, 그리고 그 구조가
실제 코드에서 어떻게 구현되어 있는지를 단계적으로 설명합니다.
"왜 이렇게 복잡한가?" 부터 "어디서 무엇이 깨지면 어떤 일이 벌어지나?" 까지
실제 사례와 코드 스니펫을 곁들여 정리했습니다.

---

## 목차

1. [한 장면 비유 — 호텔 금고 ↔ 마스터 키 ↔ 손님 카드키](#1-한-장면-비유)
2. [무엇으로부터 보호하려 하는가 (위협 모델)](#2-무엇으로부터-보호하려-하는가)
3. [등장인물 4명 — 키 계층 한눈에 보기](#3-등장인물-4명--키-계층-한눈에-보기)
4. [흐름 1: 사용자 가입·로그인 → KEK 만들기](#4-흐름-1-사용자-가입로그인--kek-만들기)
5. [흐름 2: 새 작품 만들기 → work_key 발급 (이중 wrap)](#5-흐름-2-새-작품-만들기--work_key-발급)
6. [흐름 3: 회차 본문 저장 → 필드 암호화](#6-흐름-3-회차-본문-저장--필드-암호화)
7. [흐름 4: AI 가 본문 읽기 → 내부 복호화 API](#7-흐름-4-ai-가-본문-읽기--내부-복호화-api)
8. [Doppler 가 하는 일 (왜 AWS KMS 를 버렸나)](#8-doppler-가-하는-일)
9. [Vault 가 깨지면? KEK 가 깨지면? — 장애 모델](#9-장애-모델)
10. [정직한 한계 — "제로 지식" 이라고 부르면 안 되는 이유](#10-정직한-한계)
11. [운영 체크리스트 (회전·재기동·복구)](#11-운영-체크리스트)

---

## 1. 한 장면 비유

상상해 봅시다. 당신은 호텔에 묵으면서 "아무도 못 보는 일기장" 을 방에 두고 싶습니다.

| 비유 | 실제 시스템 |
|---|---|
| 일기장 본문 | `episode.content` — 회차 평문 |
| 일기장의 자물쇠 | `work_key` — 작품마다 1개의 AES-256 대칭키 |
| 자물쇠의 열쇠 (당신만 들고 다님) | `KEK` — 사용자 브라우저 메모리에만 존재 |
| 자물쇠를 한 번 더 감싼 호텔 금고 | `server_encrypted_dek` — Vault 가 wrap 한 work_key |
| 호텔 금고의 마스터 키 (호텔 매니저 손에) | Vault Transit Engine 의 `folio-work-dek` |
| 일기장을 호텔에 맡길 때 매니저가 들어주는 비밀 인사 | `SERVER_PEPPER` — 서버 페퍼 (Doppler ENV) |

**핵심**: 일기장 자체 (`episode.content`) 는 **이중으로 잠가져 있고**, 두 자물쇠를 풀
열쇠는 **두 곳에 분산** 되어 있습니다.

---

## 2. 무엇으로부터 보호하려 하는가

### 보호 대상 (= 막아야 하는 시나리오)

1. **DB 덤프 유출** — 누군가 PostgreSQL 백업 파일을 훔쳐도 ciphertext 만 보임
2. **백엔드 메모리 덤프 (단발성)** — 짧은 윈도우에서만 평문 노출, 사용 후 즉시 zeroize
3. **운영자 (백엔드 서버 root) 의 우발적 접근** — DB 만 보면 평문이 안 보임
4. **단일 시스템 장애** — Vault 만 털려도 KEK 가 없으면 평문 복호화 불가

### 보호 안 하는 것 (= 인정하는 한계)

- **Vault 마스터키 + 백엔드 코드 동시 장악** — 둘 다 가지면 평문 복호화 가능 (10번 항목 참고)
- **사용자 브라우저 침해** — 메모리 KEK 탈취 시 그 사용자의 작품은 노출
- **사용자 자신** — 본인이 자기 일기를 읽는 건 막을 수 없음 (당연)

---

## 3. 등장인물 4명 — 키 계층 한눈에 보기

```
              [SERVER_PEPPER]          ← Doppler ENV, 백엔드 메모리만, 32B 랜덤
                    │
                    │ HKDF (사용자별 google_sub 로 salt)
                    ▼
              [pepper_user]            ← 로그인 응답으로 클라이언트에 전달, 32B
                    │
                    │ HKDF (user_salt 로 salt)
                    ▼
              [KEK — Key Encryption Key]   ← 클라이언트 메모리, 32B
                    │
                    │ AES-GCM wrap
                    ▼
       [encrypted_dek] ──── work_key ─────► [server_encrypted_dek]
       (DB · client side)        ▲          (DB · server side)
                                 │                   ▲
                                 │                   │ Vault Transit wrap
              ┌──────────────────┘                   │
              │                                      │
              │ 작품 단위 AES-256 키                 [Vault folio-work-dek]
              │ — 32B, 작품마다 새로 생성             ← 서버 마스터키, Vault 저장소
              │
              ▼
       [episode.content ciphertext]              ← AES-GCM(work_key, 평문)
```

### 키 4개 정리

| 키 | 어디 보관 | 누가 만듦 | 회전 |
|---|---|---|---|
| **SERVER_PEPPER** | Doppler 시크릿 → 백엔드 ENV → 부팅 시 메모리 | 운영자 (`openssl rand -base64 32`) | Doppler 갱신 + 백엔드 재기동 |
| **KEK** | 클라이언트 메모리 (절대 디스크 X) | 클라이언트가 로그인마다 재도출 | 자동 (pepper_user 또는 user_salt 변경 시) |
| **work_key (raw)** | 클라이언트 메모리 / 백엔드 메모리 (TTL 5분 캐시) | 클라이언트, 작품 생성 시 1회 | 작품 단위 별도 회전 (현재 미구현) |
| **Vault folio-work-dek** | Vault 저장소 (sealed 상태로 디스크) | Vault init 시 1회 | 운영자 수동 (`vault write transit/keys/.../rotate`) |

---

## 4. 흐름 1: 사용자 가입·로그인 → KEK 만들기

### 단계별 시나리오

신규 사용자 "앤" 이 Google OAuth 로 가입합니다 (`google_sub = "1234567890"`).

**(1) 백엔드: pepper_user 도출**

[backend/src/main/java/com/storyzip/common/crypto/PepperProvider.java:66-72](../../backend/src/main/java/com/storyzip/common/crypto/PepperProvider.java#L66-L72)

```java
// HKDF: 마스터 페퍼 + google_sub → 사용자별 키 32B
byte[] salt = googleSub.getBytes(UTF_8);
byte[] derived = Hkdf.deriveKey(
    activePepper,                          // SERVER_PEPPER 32B
    salt,                                  // "1234567890"
    "folio-pepper-user-v1".getBytes(),     // 컨텍스트 라벨
    32                                     // 출력 길이
);
```

> **왜 그냥 SERVER_PEPPER 를 클라이언트에 안 주나?**
> 한 명에게 마스터 페퍼가 노출되면 *모든 사용자* 의 KEK 가 위태로워집니다.
> HKDF 로 사용자별로 다른 값을 만들어 한 사용자 노출 = 그 한 사용자 영향만.

**(2) 백엔드 → 클라이언트 응답**

`POST /auth/google/login` 응답에 다음 객체 포함:

```json
{
  "encryptionMaterial": {
    "googleSub": "1234567890",
    "userSaltBase64": "Lk3+...sZQ=",      // 첫 가입 시 생성된 32B 랜덤
    "pepperUserBase64": "h7gT...PvA=",    // HKDF 결과
    "version": "v1"
  }
}
```

**(3) 클라이언트: KEK 도출**

[frontend/src/shared/crypto/workKey.ts](../../frontend/src/shared/crypto/workKey.ts) 의 `deriveKek()`:

```typescript
// HKDF(IKM=pepper_user, salt=user_salt, info="folio-kek-v1:" + sub) → 32B → AES-GCM key
const kek = HKDF(pepperUser, userSalt, "folio-kek-v1:" + googleSub, 32);
```

이제 클라이언트는 **KEK** 를 메모리에만 들고 있습니다. 새로고침 시 다시 로그인하면
백엔드가 같은 입력으로 같은 pepper_user 를 돌려주므로 KEK 도 같은 값이 재도출됩니다.

> **데이터를 잃지 않는 이유**: KEK 는 "유도 가능" 합니다. 마스터 페퍼와 user_salt 가
> 살아 있으면 같은 KEK 가 항상 나옵니다. 사용자가 비밀번호를 잊어버려도 작품 데이터는 살아남습니다.

---

## 5. 흐름 2: 새 작품 만들기 → work_key 발급

앤이 첫 번째 작품 "초록지붕집의 앤" 을 만듭니다.

**(1) 클라이언트: work_key 32B 랜덤 생성 + KEK 로 wrap**

[frontend/src/shared/crypto/workKey.ts:43-58](../../frontend/src/shared/crypto/workKey.ts#L43-L58)

```typescript
const raw = generateWorkKey();                          // 32B 랜덤
const encryptedDekB64 = await encryptBytes(kek, raw);   // AES-GCM(KEK, raw)
const workKey = await importAesGcmKey(raw, false);      // 메모리 사용용
if (onRawAvailable) await onRawAvailable(raw);          // 서버 wrap 트리거 (다음 단계)
zeroize(raw);                                           // 메모리에서 0 으로 덮어쓰기
return { encryptedDekB64, workKey };
```

이 시점:
- `encrypted_dek` (= `encryptedDekB64`) → PowerSync 로 `work.encrypted_dek` 컬럼에 저장됨
- `workKey` → 클라이언트 메모리에만 존재 (작품 편집 동안 사용)

**(2) 클라이언트 → 백엔드: raw 키 전달 (TLS 통신)**

`POST /api/v1/works/{workId}/server-dek` 로 raw 32B 를 base64 로 전달.
TLS 라서 도청 불가능, 도착 직후 백엔드도 사용 후 zeroize.

**(3) 백엔드: Vault 로 한 번 더 wrap**

[backend/src/main/java/com/storyzip/security/WorkServerDekController.java:87-114](../../backend/src/main/java/com/storyzip/security/WorkServerDekController.java#L87-L114)

```java
byte[] raw = Base64.getDecoder().decode(req.rawWorkKey());  // 32B
byte[] wrapped = kms.encrypt(raw);                          // Vault Transit 호출
work.setServerEncryptedDek(wrapped);                        // DB BYTEA 저장
workRepo.save(work);
Arrays.fill(raw, (byte) 0);                                 // 즉시 zeroize
```

**(4) Vault Transit 의 실제 호출**

[backend/src/main/java/com/storyzip/security/VaultKmsService.java:62-75](../../backend/src/main/java/com/storyzip/security/VaultKmsService.java#L62-L75)

```java
JsonNode resp = http.post()
    .uri("/v1/transit/encrypt/{k}", "folio-work-dek")
    .header("X-Vault-Token", token)
    .body(Map.of("plaintext", Base64.encode(raw)))
    .retrieve()
    .body(JsonNode.class);
String ciphertext = resp.path("data").path("ciphertext").asText();
// 결과: "vault:v1:abc..." 형식의 ASCII 문자열 → BYTEA 로 저장
```

### 왜 두 번 wrap 하는가? (이중 wrap 의 이유)

| 시나리오 | 단일 wrap (KEK 만) | 이중 wrap (현재) |
|---|---|---|
| 클라이언트만 정상, 서버 다운 | ✅ 작가 본인은 작품 R/W 가능 | ✅ 동일 (encrypted_dek 로 풀 수 있음) |
| AI 가 비동기로 본문 분석 필요 | ❌ KEK 가 클라에만 있어 AI 못 푼다 | ✅ Vault 가 server_encrypted_dek 풀 수 있음 |
| DB 만 털림 (Vault 무사) | ❌ encrypted_dek 단일 wrap 이라 KEK 없으면 못 푼다 (안전) | ✅ 동일 안전 |
| 백엔드 코드 + Vault 동시 털림 | (해당 없음) | ❌ server_encrypted_dek 풀 수 있음 (10번 한계) |

**결정적 이유**: AI 가 작가 오프라인 상태에서도 본문을 읽고 요약·검수해야 하기 때문.
KEK 만 있으면 AI 가 평문에 접근할 방법이 없습니다.

---

## 6. 흐름 3: 회차 본문 저장 → 필드 암호화

앤이 1화 본문 "마릴라는 앤을 처음 보고 놀랐다..." 를 작성합니다.

**(1) 클라이언트: AES-GCM 암호화**

[frontend/src/shared/crypto/cipher.ts:38-51](../../frontend/src/shared/crypto/cipher.ts#L38-L51)

```typescript
const iv = crypto.getRandomValues(new Uint8Array(12));     // 96-bit nonce
const ctAndTag = await crypto.subtle.encrypt(
  { name: 'AES-GCM', iv, tagLength: 128 },
  workKey,                                                  // 메모리에 있는 work_key
  new TextEncoder().encode(plaintext)
);
return "v1:" + bytesToBase64(concat(iv, ctAndTag));
```

저장되는 형식: `v1:Xy7K3...d8Q==`

| 부분 | 길이 | 의미 |
|---|---|---|
| `v1:` | 3 byte | 버전 prefix (포맷 변경 대비) |
| IV | 12 byte | 매번 다른 랜덤값 (같은 평문도 다른 ciphertext) |
| ciphertext | 평문과 동일 | 실제 암호문 |
| auth tag | 16 byte | 위변조 검출 (틀리면 복호화 시 예외) |

**(2) PowerSync 가 ciphertext 그대로 서버에 동기화**

서버 PostgreSQL `episode.content` 컬럼에는 `v1:Xy7K3...` 만 저장됩니다.
DBA 가 직접 `SELECT content FROM episode` 해도 의미 있는 문자열 0.

**(3) 다른 기기에서 같은 사용자가 보면?**

같은 KEK 가 도출 → 같은 work_key 복원 → ciphertext 정상 복호화 → 평문 표시.

> **AES-GCM 의 IV 재사용 위험**: 동일 키 + 동일 IV 로 두 번 암호화하면 GCM 의
> 무결성이 깨집니다. 그래서 매번 `crypto.getRandomValues(12)` 로 새 IV 사용.
> work_key 가 작품마다 다르고 IV 가 매 호출마다 다르므로 충돌 확률 ≈ 0.

---

## 7. 흐름 4: AI 가 본문 읽기 → 내부 복호화 API

작가가 1화 status 를 'completed' 로 변경 → AI 서버가 요약을 만들려 합니다.

**(1) AI 서버: 본문 평문이 필요**

```python
# ai/app/services/work_key_resolver.py
async def resolve_episode_plaintext(episode_id: str, work_id: str) -> str:
    url = f"{backend_internal_url}/internal/works/{work_id}/decrypt-episode/{episode_id}"
    headers = {"X-Internal-Api-Key": settings.internal_api_key}
    resp = await client.post(url, headers=headers)
    if resp.status_code == 409:
        raise WorkKeyResolverError("server_encrypted_dek not yet issued")
    return resp.json()["plaintext"]
```

**(2) 백엔드 내부 컨트롤러: Vault 로 unwrap → AES-GCM 복호화**

```java
// InternalDecryptController
byte[] workKey = workKeyService.resolveWorkKey(workId);    // Vault 호출 + 5분 캐시
String plain = AesGcmCipher.decryptString(workKey, episode.getContent());
return ResponseEntity.ok(new DecryptEpisodeResponse(workId, episodeId, plain));
// finally: Arrays.fill(workKey, (byte) 0);
```

**(3) WorkKeyService 의 캐시**

[backend/src/main/java/com/storyzip/security/WorkKeyService.java:35-44](../../backend/src/main/java/com/storyzip/security/WorkKeyService.java#L35-L44)

```java
Cache<UUID, byte[]> cache = Caffeine.newBuilder()
    .expireAfterWrite(Duration.ofSeconds(300))  // 5분
    .maximumSize(1000)
    .build();
```

> **왜 캐시?** Vault `/transit/decrypt` 는 매 호출 ~50ms. 한 회차에 청킹·요약·임베딩 등
> 여러 작업이 work_key 를 필요로 하면 그때마다 Vault 호출하면 느림.
> 5분 TTL 후 자동 폐기. 메모리 잔류 위험 vs 응답 시간 trade-off.

**(4) 핵심 — AI 서버에는 KEK 도 SERVER_PEPPER 도 없다**

AI 서버는 그저 **백엔드 내부 API 한 곳** 만 호출합니다. AI 서버가 통째로 털려도
키 자체는 노출되지 않습니다 (요청 가능한 episode 만 평문화).
대신 `INTERNAL_API_KEY` 가 노출되면 임의 episode 평문 fetch 가능 → Doppler 시크릿.

---

## 8. Doppler 가 하는 일

### 왜 AWS Secrets Manager 를 버렸나

기존 설계:
```
EC2 백엔드 → AWS SDK → secretsmanager.amazonaws.com (HTTPS)
              ↑
              IAM 인증 + outbound 443 필요
```

문제:
- SSAFY 환경: EC2 outbound 차단 / IAM 권한 수정 불가
- AWS SDK 호출 자체가 실패 → 백엔드 부팅 불가

현재 설계:
```
[운영자 머신]
  doppler run --config prd -- docker compose up
       ↓
       Doppler CLI 가 시크릿 fetch (1회) → 컨테이너 ENV 로 주입
       ↓
[backend 컨테이너]
  System.getenv("SERVER_PEPPER")    ← 메모리만 읽음, 외부 통신 0
```

### 비교

| 항목 | AWS Secrets Manager | Doppler ENV 주입 |
|---|---|---|
| 런타임 외부 통신 | 매번 SDK 호출 | **0** |
| EC2 → 인터넷 outbound 필요 | ✅ 필수 | ❌ 불필요 |
| IAM 권한 | ✅ 필요 | ❌ 불필요 |
| 시크릿 회전 시 | SDK 가 자동 갱신 | 백엔드 **재기동 필요** |
| AWS 장애 영향 | backend 죽음 | **0** |

**즉 SSAFY EC2 + IAM 제약과 무관해진 상태**.
신경 쓸 것은 "Doppler 시크릿 등록되어 있는가" + "배포 스크립트가 `doppler run` 으로 감싸는가" 두 가지뿐.

### 실제 ENV 변수

| 변수 | 어디서 사용 | 부재 시 동작 |
|---|---|---|
| `VAULT_TOKEN` | backend → Vault Transit 호출 | 부팅 시 401 → 재시도 무한 → 사실상 부팅 실패 |
| `SERVER_PEPPER` | backend → PepperProvider | `IllegalStateException` 던지며 부팅 거부 ([PepperProvider.java:44](../../backend/src/main/java/com/storyzip/common/crypto/PepperProvider.java#L44)) |
| `INTERNAL_API_KEY` | AI ↔ backend 내부 API 인증 | AI 서버가 backend 호출 시 403 |

---

## 9. 장애 모델

### "Vault 가 깨졌다 (sealed 상태)"

- 신규 작품 생성 시 server_encrypted_dek 발급 불가 → 클라이언트는 작품 자체는 만들 수 있음 (encrypted_dek 만 저장)
- AI 서버 본문 fetch 401/503 → 자동 skip + 다음 sync 시 재시도 (`triggerEpisodeSummaryAfterCommit` 의 `serverEncryptedDekReady` 체크)
- **작가 본인의 작품 R/W 영향 0** — 클라이언트는 KEK + encrypted_dek 만으로 동작
- **복구**: `bash infra/scripts/vault-unseal.sh` (운영자 수동, 3/5 unseal 키 필요)

### "SERVER_PEPPER 가 사라졌다 / 잘못 변경됐다"

- 모든 사용자의 pepper_user 도출 결과가 달라짐 → 클라이언트의 KEK 가 더 이상 같은 값으로 안 나옴
- 결과: encrypted_dek 복호화 실패 → **모든 사용자의 모든 작품 평문 접근 불가**
- **이건 데이터 손실급 사고**. SERVER_PEPPER 백업 필수.
- 복구: 백업한 SERVER_PEPPER 를 Doppler 에 다시 등록 + 백엔드 재기동.

### "사용자가 user_salt 를 잃어버렸다"

- 백엔드 DB 의 `user.user_salt` 가 살아 있는 한 자동 복구
- DB 자체가 망가지면 회복 불가 (DB 백업 정책 일반론)

### "클라이언트 브라우저 메모리가 dump 됐다"

- 그 사용자 KEK 노출 → 그 사용자 작품들의 work_key 도 다 노출 가능
- 다른 사용자 영향 0 (HKDF 분리 덕분)

---

## 10. 정직한 한계

### "제로 지식" 이라고 말하면 사기인 이유

- Vault 의 unseal 키 3개를 가진 운영자 + 백엔드 코드 동시 장악 시
- → Vault 로 server_encrypted_dek 풀 수 있음 (folio-work-dek 으로 decrypt)
- → work_key 평문 획득
- → episode.content 의 AES-GCM 복호화 가능
- 결국 **운영자 작정하면 일기장 다 볼 수 있음**

### 그럼 이 시스템이 뭘 막아주는가? (정직한 가치)

1. **DB 백업/덤프 단발 유출** — 가장 흔한 실사고 방어. ciphertext 만 노출.
2. **운영자의 우발적·일상적 접근** — `SELECT content FROM episode` 로는 안 보임. 평문 보려면 일부러 Vault unseal + 코드 호출 = 추적 가능한 행위.
3. **단일 시스템 침해 격리** — Vault 만 털려도 KEK 부재로 평문 복호화 불가 / DB 만 털려도 동일.
4. **AI 서버 노출 격리** — AI 서버가 통째로 털려도 키 자체는 backend 메모리/Vault 에만.

### 진짜 제로 지식이 되려면?

작가가 원고를 저장할 때마다 클라이언트가 KEK 로 직접 암호화 → 서버는 ciphertext 만 보관 →
**AI 분석 불가능**. Folio 는 AI 기능을 위해 의도적으로 server_encrypted_dek 트랙을 둠.
"기능 vs 절대 비밀" 의 trade-off 에서 기능 쪽으로 살짝 기울인 설계.

마케팅 시 "운영자도 절대 못 봅니다" 같은 문구 사용하면 안 됨. 대신:

> "원고는 작품마다 별도 키로 암호화되어 저장됩니다. DB 자체가 유출되어도
> 평문은 노출되지 않습니다. 운영자가 평문에 접근하려면 다중 인증된 절차를
> 거쳐야 하며, 모든 접근은 감사 로그에 기록됩니다."

가 정확하고 거짓 없는 표현.

---

## 11. 운영 체크리스트

### 배포 시
- [ ] Doppler 에 `VAULT_TOKEN`, `SERVER_PEPPER`, `INTERNAL_API_KEY` 모두 등록되어 있나?
- [ ] `dev-start.sh` / `infra/scripts/deploy.sh` 가 `doppler run` 으로 감싸져 있나?
- [ ] `infra/scripts/vault-status.sh` → unsealed 상태인가? (sealed 면 부팅 실패)

### Vault 재기동 후
- [ ] `bash infra/scripts/vault-unseal.sh` 실행 (3/5 unseal 키 입력)
- [ ] backend 헬스체크 정상 (`/v1/health`) — Vault 연결 확인
- [ ] `WorkKeyService` 캐시는 자동 무효화됨, 5분 내 자동 회복

### SERVER_PEPPER 회전 (계획적 회전, 예: 6개월마다)
1. 새 페퍼 생성: `NEW=$(openssl rand -base64 32 | tr -d '\n')`
2. **이전 페퍼 백업** (영구 보관 — 회전 후에도 기존 사용자 KEK 검증에 필요할 수 있음)
3. `doppler secrets set SERVER_PEPPER="$NEW"`
4. `SERVER_PEPPER_VERSION` bump (`v1` → `v2`)
5. backend 롤링 재기동
6. 클라이언트는 다음 로그인 시 새 pepper_user 받음 → 새 KEK 도출
   → 기존 encrypted_dek 복호화 실패 → 마이그레이션 필요 (Phase 2 별도 작업)

> **알파 단계 정책**: 페퍼 회전 시 기존 데이터 wipe 가능. 운영 출시 후엔 별도
> 마이그레이션 흐름 설계 필요.

### 사고 대응
- DB 만 유출 → 평문 안전, 단 사용자에게 "ciphertext 가 노출되었으나 키가 분리되어 있어 평문 복호화는 불가능" 공지
- Vault 마스터키 + DB 동시 유출 → 비상 → 모든 사용자 강제 로그아웃 + KEK 재발급 + work_key 회전 (대규모 작업)

---

## 부록 A — 자주 받는 질문

**Q. 사용자가 비밀번호(Google 로그인)를 잊으면 작품도 잃나요?**
> 아니요. KEK 는 SERVER_PEPPER + google_sub + user_salt 로 도출되므로 Google 계정 복구 후
> 같은 sub 로 로그인하면 같은 KEK 가 다시 도출됩니다.

**Q. 다른 기기에서 로그인하면 다시 동기화되나요?**
> 네. 백엔드가 같은 pepper_user / user_salt 를 응답하므로 같은 KEK 가 도출되어
> 기존 ciphertext 복호화 가능.

**Q. KEK 를 굳이 클라이언트 쪽에서 만드는 이유는?**
> "운영자가 작정해도 일상적으로는 평문 못 본다" 를 보장하려고. SERVER_PEPPER 만으로
> 복호화 가능하면 백엔드 메모리 dump 한 번에 모든 사용자 평문 노출.

**Q. PowerSync 동기화 중에는 평문이 흐르나요?**
> 아니요. 클라이언트가 이미 ciphertext 로 만든 후 PowerSync 에 넣습니다.
> PowerSync 백엔드도 ciphertext 만 봅니다.

**Q. 회차 검수·요약을 위해 AI 가 본문을 보는 건 사용자 동의가 있나요?**
> AI 기능은 옵트인 흐름 + 프리미엄 게이팅으로 발화. 본문은 AI 서버 메모리에만 일시
> 존재 후 결과(요약/임베딩)만 영속화 — 평문은 어디에도 저장되지 않음.

---

## 부록 B — 관련 파일 인덱스

### 백엔드 (Java)
- [PepperProvider.java](../../backend/src/main/java/com/storyzip/common/crypto/PepperProvider.java) — SERVER_PEPPER → pepper_user 도출
- [Hkdf.java](../../backend/src/main/java/com/storyzip/common/crypto/Hkdf.java) — RFC 5869 HKDF 구현
- [VaultKmsService.java](../../backend/src/main/java/com/storyzip/security/VaultKmsService.java) — Vault Transit HTTP 호출
- [WorkKeyService.java](../../backend/src/main/java/com/storyzip/security/WorkKeyService.java) — work_key resolve + Caffeine 캐시
- [WorkServerDekController.java](../../backend/src/main/java/com/storyzip/security/WorkServerDekController.java) — POST /works/{id}/server-dek
- [AesGcmCipher.java](../../backend/src/main/java/com/storyzip/security/AesGcmCipher.java) — AES-GCM 암복호화

### 프론트 (TypeScript)
- [crypto/cipher.ts](../../frontend/src/shared/crypto/cipher.ts) — AES-GCM 암복호화
- [crypto/workKey.ts](../../frontend/src/shared/crypto/workKey.ts) — KEK 도출 + work_key wrap
- [crypto/serverDek.ts](../../frontend/src/shared/crypto/serverDek.ts) — 서버 wrap 요청 + pending queue
- [stores/authStore.ts](../../frontend/src/shared/stores/authStore.ts) — KEK 메모리 보관 + 로그아웃 정리

### AI 서버 (Python)
- [services/work_key_resolver.py](../../ai/app/services/work_key_resolver.py) — backend 내부 API 호출

### 인프라
- [infra/dev/docker-compose.dev.yml](../../infra/dev/docker-compose.dev.yml) — vault 서비스 정의
- [infra/scripts/vault-init.sh](../../infra/scripts/vault-init.sh) — Vault 초기화·unseal·정책 등록
- [infra/scripts/vault-unseal.sh](../../infra/scripts/vault-unseal.sh) — 재기동 후 unseal
- [docs/security/vault-integration.md](./vault-integration.md) — 운영 가이드 (이 문서와 별도)
- [docs/security/vault-quickstart.md](./vault-quickstart.md) — 빠른 시작
