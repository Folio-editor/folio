# Plan C — 보안 하드닝 (Phase 1 필수 보강)

[Plan C 본문](./encryption-plan-C-oauth-derived.md) 정밀 재검토에서 드러난 **치명적 결함 4건 + 미세 조정 3건**의 근거와 처리 방침을 보존한다.

> 본문은 최종안만 담고, 이 문서는 "왜 그 결정을 내렸는지" 이력 참고용. Plan B → C 전환의 [decision-log](./encryption-decision-log.md)와 같은 역할.

---

## 한 줄 결론

원안 Plan C에는 **`pepper`를 클라이언트로 직접 전송**, **HKDF 인자 매핑 부정확**, **웹 IndexedDB에 raw KEK 평문 저장**, **`pepper` 분실 대비 Phase 2 미룸** — 4건의 치명적 결함이 있었다. 이를 Phase 1 필수 보강으로 끌어올려 본문에 반영했다.

---

## 🔴 치명적 결함 4건

### 결함 1 — `pepper`를 클라이언트로 직접 전송

#### 원안
```
Client ←── {sub, salt, pepper, jwt} ──── Spring
```

#### 왜 문제인가
| 위험 | 설명 |
|---|---|
| 모든 클라이언트에 평문 노출 | 사용자 1명 디바이스 털리면 글로벌 마스터 시크릿 노출 |
| TLS 가정 깨짐 | 회사망 SSL 인터셉트 프록시(보안 솔루션이 흔히 사용) → 평문 캡처 |
| Electron/브라우저 DevTools | 사용자가 자기 토큰 응답 보는 건 일상 |
| 로그/Sentry 잔존 | 분석 툴, 네트워크 캡처에 pepper 흔적 |
| 블래스트 반경 | pepper 1회 노출 = 모든 사용자의 모든 본문 위험 (DB 함께 털리면 즉시 복호화) |

원안에서 본인도 인지(§"pepper를 클라이언트로 보내는 게 안전한가")하고 "Phase 2에서 결정"으로 미뤘으나, **이는 Phase 0 게이트 사안**.

#### 수정안
Spring 메모리에서만 `server_pepper` 보유. 응답엔 사용자별 파생값만:
```
pepper_user = HKDF(IKM=server_pepper, salt=sub, info="folio-pepper-user-v1")
```

수정된 플로우:
```
Spring (메모리에서만):
  pepper_user = HKDF(server_pepper, sub)  ← 사용자별 파생값

Client ←── {sub, salt, pepper_user, jwt} ──── Spring

Client:
  KEK = HKDF(IKM=pepper_user, salt=user_salt, info="folio-kek-v1:"+sub)
```

#### 효과
- 클라이언트는 자기 사용자용 파생값만 받음
- 디바이스 1대 털려도 다른 사용자 영향 0
- `server_pepper` 자체는 절대 서버 밖으로 안 나감
- 구현 비용: HKDF 1회 추가 (거의 0)

#### 결정
**Phase 2 → Phase 1 필수**로 격상. 결정 7 본문 변경.

---

### 결함 2 — HKDF 입력 매핑 부정확

#### 원안
```
KEK = HKDF(google_sub, server_pepper, user_salt)
```

#### 왜 문제인가
HKDF는 RFC 5869 표준상 3개 입력이 있다:

| 입력 | 역할 | 값의 성격 |
|---|---|---|
| **IKM** (Input Keying Material) | 엔트로피 소스 | 비밀이어야 함 |
| **salt** | 무작위 공개값 | 사용자별/세션별 분리 |
| **info** | 컨텍스트 분리용 | 도메인/버전 라벨 |

원안의 함수형 표기는 인자 자리를 모호하게 둬서, 구현 시 IKM 자리에 `google_sub`를 넣으면:
- `google_sub`는 비밀이 아닌 식별자 (구글 발급 안정 ID)
- IKM 자리에 비밀스럽지 않은 값을 넣으면 KEK 엔트로피가 `pepper`에만 의존
- 그게 털리면 끝

#### 수정안 — 표준 매핑 명시
```
KEK = HKDF(
  IKM  = pepper_user,                       // 비밀, 엔트로피 소스
  salt = user_salt,                         // 사용자별 무작위 16~32B
  info = "folio-kek-v1:" || google_sub      // 컨텍스트 분리
)
```

WebCrypto 호출 예시:
```ts
const keyMaterial = await crypto.subtle.importKey(
  'raw', pepperUser, { name: 'HKDF' }, false, ['deriveBits']
);
const kekBits = await crypto.subtle.deriveBits(
  {
    name: 'HKDF',
    hash: 'SHA-256',
    salt: userSalt,
    info: new TextEncoder().encode(`folio-kek-v1:${googleSub}`),
  },
  keyMaterial,
  256
);
```

#### 결정
**결정 12 신규** — HKDF 입력 매핑은 본 매핑을 따르며, 코드 리뷰 시 인자 자리를 반드시 검증.

---

### 결함 3 — 웹 IndexedDB에 raw KEK 평문 저장

#### 원안 (§평문이 존재하는 위치)
```
| 데스크탑 safeStorage | O (OS 보호) |
| 웹 IndexedDB         | O          |
```

#### 위험 분리

**3a. 데스크탑 safeStorage** — 상대적으로 안전. OS 사용자 자격증명으로 잠금. 단:
- Windows DPAPI: 사용자 계정 비밀번호가 약하면 부팅 후 다른 프로세스가 복호화 가능
- macOS Keychain: OS 잠금 상태에서만 안전
- → 디바이스 도난 + OS 안 잠긴 상태 = KEK 노출

**3b. 웹 IndexedDB** — ⚠️ 심각
- IndexedDB는 평문 저장 영역. 단순 디스크 접근으로 읽힘
- XSS 1방에 KEK 노출 → CSP가 약하면 즉사
- 브라우저 프로파일 동기화(Chrome Sync)로 다른 디바이스로 복제 위험

#### 수정안
- **데스크탑**: safeStorage 유지 (OS 보호 충분)
- **웹**: WebCrypto의 **non-extractable CryptoKey** 사용

```ts
// 도출 결과를 raw bytes로 저장하지 말고, 즉시 non-extractable CryptoKey로 import
const kek = await crypto.subtle.importKey(
  'raw',
  kekBits,
  { name: 'AES-GCM' },
  /* extractable */ false,        // 핵심: 디스크 저장 후에도 추출 불가
  ['encrypt', 'decrypt']
);

// IndexedDB에는 CryptoKey 핸들만 보관 (구조화 복제로 저장됨)
await idbStore.put('kek', kek);
```

#### 효과
- 디스크 직접 접근으로 키 raw bytes 추출 **불가**
- XSS가 발생해도 키 자체는 못 빼냄 (단 페이지 컨텍스트 내 encrypt/decrypt 호출은 가능 — CSP로 보강)
- 메모리에는 raw bytes 보관 금지, CryptoKey 객체로만 다루기

#### 결정
**결정 13 신규** — 웹 KEK 저장은 non-extractable CryptoKey + IndexedDB 핸들만. raw bytes 디스크 저장 금지.

---

### 결함 4 — `pepper` 분실 대비 과소평가

#### 원안 (§Plan B 대비 표)
```
| 데이터 영구 소실 위험 | 중 (pepper 분실 시) — Secrets Manager 백업으로 완화 |
```

#### 왜 문제인가
시나리오:
- AWS 계정 탈취 → 공격자가 Secrets Manager에서 pepper 삭제
- 운영 실수로 pepper 덮어씀
- AWS 리전 장애 + 백업 미동기화

→ pepper 사라지면 모든 사용자의 모든 작품 영구 복구 불가. **작가 입장에서 "Folio가 내 모든 원고를 잃어버림"** 사고.

#### Plan B (KMS) 대비 진짜 차이
- KMS: AWS 자체 다중 가용영역 보관, 사용자 실수 삭제도 7~30일 복구 가능
- Secrets Manager: 같은 7~30일 복구 가능하나 **그 이후 영구 소실**, KMS보다 광범위 보호 부족

원안은 "Secrets Manager 자동 백업"만 언급했지만 **불충분**.

#### 수정안 — Phase 1 필수 보강
1. **다중 리전 복제** 활성화 (Secrets Manager 기본 기능)
2. **삭제 보호**: Resource Policy에 `secretsmanager:DeleteSecret` deny + 특정 IAM에만 허용
3. **MFA 요구**: pepper 변경/삭제 작업에 MFA 필수
4. **오프사이트 백업**: pepper 32B를 종이 또는 HSM에 별도 보관, 운영자 **2명 합의**(2-of-2)로만 접근

#### 결정
**Phase 2 → Phase 1 필수**로 격상. 결정 10 본문 변경.

---

## ⚠️ 미세 조정 3건

### 조정 5 — `pepper_user` 매 로그인 응답 불필요

#### 원안
§1 다이어그램이 매 로그인마다 `pepper_user` 응답에 포함.

#### 문제
- `pepper_user`는 사용자에게 사실상 영구값 (server_pepper 회전 전까지)
- 매 로그인마다 보낼 필요 없음 → 불필요한 노출 빈도 증가

#### 수정안
- **첫 로그인 1회만 응답** → safeStorage/IndexedDB에 캐시
- 이후 재로그인 시 재발송 불필요
- server_pepper 회전 시 강제 재발급 플래그로 갱신

---

### 조정 6 — KEK 라이프사이클 정책 부재

#### 원안
KEK를 safeStorage / IndexedDB에 저장한다고만 하고:
- 사용자 로그아웃 시 KEK 삭제? (미정)
- 비활성 N분 후 자동 삭제? (미정)
- 다른 사용자가 같은 디바이스 로그인 시? (미정)

#### 수정안
**결정 11 신규** — KEK 라이프사이클:
- 로그아웃 시 **즉시 삭제** (safeStorage/IndexedDB 모두)
- 비활성 **30일** 후 자동 삭제 (디바이스 분실 대비)
- **사용자 전환 시 삭제** (디바이스 공유 시나리오)

---

### 조정 7 — `migration_status` 컬럼이 PowerSync와 충돌

#### 원안
```sql
ALTER TABLE work ADD COLUMN migration_status TEXT;  -- 'pending' / 'done'
```

#### 문제
work 테이블이 PowerSync 동기화 대상이라면 `migration_status`도 다중 디바이스에 동기화됨:
- 디바이스 A가 마이그레이션 완료 → `done`
- 디바이스 B가 같은 시점에 작업 중 → 충돌 가능
- PowerSync 큐 폭주 시 `done` 플래그가 다른 디바이스로 전파되며 race condition

#### 수정안
**결정 14 신규** — `migration_status`를 다음 중 한 곳으로 분리:
- **별도 `migration_log` 테이블** (서버 측, sync 대상 아님), 또는
- **클라이언트 로컬 SQLite의 local-only 테이블** (PowerSync sync 제외)

work 본체에는 두지 않는다.

---

## 4요건 매트릭스 — 하드닝 전 vs 후

| 시나리오 | 원본 Plan C | 하드닝 후 |
|---|---|---|
| 데스크탑 온라인 | ✅ | ✅ |
| 데스크탑 비행기모드 재시작 | ✅ | ✅ |
| 데스크탑 비행기모드 새 작품 | ✅ | ✅ |
| 웹 새로고침 후 작업 | ✅ | ✅ |
| 웹 + 데스크탑 동시 | ✅ | ✅ |
| PowerSync 무수정 | ✅ | ✅ |
| DB 단독 유출 | ✅ 안전 | ✅ 안전 |
| **TLS 가정 깨진 환경 (회사망)** | ❌ pepper 캡처 | ✅ pepper_user만 노출, blast radius 1 |
| **클라이언트 디바이스 도난 (웹)** | ❌ IndexedDB raw KEK | ✅ non-extractable CryptoKey |
| **pepper 운영 사고** | ❌ 영구 소실 | ✅ 다중 리전 + 오프사이트 백업 |
| Spring + Secrets Manager 동시 유출 | ❌ 본문 노출 | ❌ 본문 노출 (E2EE 한계, 모든 모델 공통) |

---

## 결정 사항 변경/추가

| # | 원안 | 하드닝 후 |
|---|---|---|
| 7 | pepper 평문 전송, 보강은 Phase 2 | **Phase 1 필수**: `pepper_user = HKDF(server_pepper, sub)`만 클라이언트 전송. server_pepper는 절대 서버 밖으로 안 나감 |
| 10 | Secrets Manager 자동 백업, 분할 보관 Phase 2 | **Phase 1 필수**: 다중 리전 복제 + DeleteSecret deny + MFA + 오프사이트 백업(운영자 2명 합의) |
| 11 (신규) | — | **KEK 라이프사이클**: 로그아웃 즉시 삭제 / 비활성 30일 자동 삭제 / 사용자 전환 시 삭제 |
| 12 (신규) | — | **HKDF 입력 매핑**: IKM=pepper_user, salt=user_salt, info="folio-kek-v1:"+sub. 코드 리뷰 시 인자 자리 검증 |
| 13 (신규) | — | **웹 KEK 저장**: WebCrypto non-extractable CryptoKey + IndexedDB 핸들만. raw bytes 디스크 저장 금지 |
| 14 (신규) | — | **migration_status는 work 본체 분리**: local-only 테이블 또는 migration_log 테이블 |

---

## 코드 리뷰 시 반드시 확인할 항목

| 항목 | 확인 방법 |
|---|---|
| HKDF 인자 자리 | `crypto.subtle.deriveBits({salt, info})` 호출이 결정 12 매핑 따르는지 |
| `/api/v1/auth/login` 응답 본문 | `server_pepper` 필드 있으면 거부 (`pepper_user`만 허용) |
| 웹 KEK import 형식 | `subtle.importKey(..., extractable=false, ...)` 호출 누락 시 거부 |
| Secrets Manager IAM 정책 | `secretsmanager:DeleteSecret` deny가 있는지, MFA 요구 조건 있는지 |
| 로그/Sentry 마스킹 | request body에서 `pepper`, `pepper_user`, `salt`, `googleIdToken` 자동 마스킹 룰 |
| 마이그레이션 rate limit | 클라이언트 PowerSync 큐에 분당 N개 이상 안 쌓이는지 |
| AI 호출 응답 본문 폐기 | Spring 프록시 후 메모리 명시적 폐기 (Java GC 의존 금지, 가능하면 byte[] zeroize) |

---

## 한 줄 결론

원안 Plan C는 4요건은 충족했지만, **`pepper` 클라이언트 전송**과 **웹 IndexedDB raw KEK 저장**이 그대로 들어가면 보안 도입 명분 자체가 흔들렸다. 4건의 결함을 Phase 1 필수 보강으로 끌어올리고, 3건의 미세 조정을 결정사항에 추가해 본문에 반영했다.
