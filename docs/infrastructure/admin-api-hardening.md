# 관리자 API 보안 강화 가이드

본 문서는 관리자 API(`/api/v1/admin/**`)에 대한 단기 보안 조치를 정리합니다. Phase B에서 `Writer.role=ADMIN` 기반 인증으로 강화하기 전까지 알파/베타 단계의 임시 방어책입니다.

## 위협 모델

`X-Admin-Token` 단일 토큰이 노출되면 누구든 환불 승인/거절 가능 → **사업적 손실 직접 발생**.

## 운영자 페이지 사용법

운영자 본인 PC 에서만 사용. 일반 사용자 빌드에는 토큰 미포함이라 메뉴가 보이지 않는다.

### 1. 운영자 토큰 발급

`ADMIN_API_TOKEN` 값을 Doppler `prd` 에서 본인이 안전한 곳에 저장한 그대로 사용 (또는 별도 운영자 토큰 분리).

### 2. `frontend/.env.local` 에 추가

```env
VITE_ADMIN_API_TOKEN=<ADMIN_API_TOKEN 값>
VITE_API_URL=https://folio-editor.co.kr/api/v1
```

⚠️ `.env.local` 은 `.gitignore` 대상. **절대 git 에 커밋 금지**. 운영자 본인 PC 에만.

### 3. 운영자 빌드 띄우기

```bash
# Electron 앱 (가장 간단)
cd frontend && pnpm dev

# 또는 웹 (브라우저)
cd frontend && pnpm dev:web
# → http://localhost:5173 접속
```

### 4. 메뉴 진입

설정 → **"환불 검토 (운영자)"** 메뉴 클릭. 토큰이 있을 때만 표시됨.

### 5. 처리

- 검토 대기 탭에서 환불 신청 확인
- [승인] / [거절] 버튼 클릭 → 메모 입력 → 처리
- 승인 시 PortOne 자동 취소 + 토큰 회수
- 거절 시 결제 상태 그대로, 사용자에게 거절 사유 안내

### 6. 토큰 누출 시

1. Doppler 에서 `ADMIN_API_TOKEN` 새로 생성 + 등록
2. 운영자 PC 의 `.env.local` 갱신
3. EC2 backend 재기동 (deploy.sh 또는 GitLab Retry)

## 적용된 방어 (코드)

### 1. AdminAuthInterceptor — Rate limit + 실패 알림

[AdminAuthInterceptor.java](../../backend/src/main/java/com/storyzip/admin/AdminAuthInterceptor.java)

- 같은 IP 가 15분 window 내 인증 5회 초과 실패 시 **즉시 429 차단**
- 인증 실패 시 운영자 이메일(`2square.f203@gmail.com`)에 5분 쿨다운으로 알림
- IP 추출 시 `X-Forwarded-For` 헤더 우선 (nginx 뒤이므로)

### 2. RefundService.approveRefund — PortOne 호출을 트랜잭션 마지막으로

[RefundService.java](../../backend/src/main/java/com/storyzip/payment/service/RefundService.java)

DB 변경(refund.approve, payment.markCanceled, 토큰 회수)을 먼저 수행하고 PortOne `cancelPayment` 를 마지막에 호출. 중간 단계 실패 시 PortOne 호출 전이라 일관성 깨지지 않음.

### 3. 불일치 감지 스케줄러

[RefundConsistencyScheduler.java](../../backend/src/main/java/com/storyzip/payment/scheduler/RefundConsistencyScheduler.java)

5분 주기로 최근 24시간 내 APPROVED 환불 vs PortOne 결제 상태 비교. 불일치 발견 시 운영자 이메일로 통보. PortOne 호출 commit 직전 사고 / 운영자 DB 직접 수정 등 모든 케이스 사후 감지.

## 권장 추가 조치 (인프라, 코드 외)

### A. nginx IP 화이트리스트 (운영자 IP 고정 시 강력 추천)

`infra/prod/nginx/conf.d/admin.conf` (또는 기존 server 블록 안):

```nginx
# 관리자 API — 운영자 IP 만 허용
location /api/v1/admin/ {
    # 본인 사무실/집 IP 추가 (여러 줄 가능)
    allow 49.143.191.33;     # 운영자 1
    # allow 1.2.3.4;          # 운영자 2 추가 시
    deny all;

    # 기존 backend upstream 설정 그대로
    proxy_pass http://backend;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

적용:

```bash
# nginx 컨테이너에서 설정 reload
docker exec folio-nginx nginx -t       # 설정 검증
docker exec folio-nginx nginx -s reload
```

⚠️ 운영자 IP 가 동적이면 부적합. 그 경우:

- VPN 게이트웨이 도입 (운영자 → VPN → EC2)
- 또는 EC2 localhost 에만 노출 + SSH 터널 (`ssh -L 8080:localhost:80`) 사용

### B. ADMIN_API_TOKEN 정기 회전

3개월마다:

```bash
# 새 토큰 생성
NEW=$(openssl rand -base64 32)
echo "$NEW"   # 안전한 곳에 즉시 저장

# Doppler 갱신
doppler secrets set ADMIN_API_TOKEN="$NEW" --project folio --config prd

# EC2 backend 재기동 (deploy.sh 또는 수동)
```

### C. 호출 IP 로그 분석

backend 구조화 로그(`[ADMIN_REFUND_APPROVE]` `[ADMIN_AUTH_FAILED]` 등)를 Loki 에서 필터:

```
{job="folio-backend"} |= "[ADMIN_" | json
```

비정상 IP / 시간대 / 빈도 발견 시 즉시 토큰 회전.

## 감사 로그 (AdminAuditLog)

모든 admin API 호출이 `admin_audit_log` 테이블에 별도 트랜잭션으로 INSERT 됩니다.

### 컬럼

| 컬럼 | 설명 |
|---|---|
| `action` | `REFUND_APPROVE` / `REFUND_REJECT` / `REFUND_LIST_REQUESTED` / `AUTH_FAILED` / `AUTH_RATE_LIMITED` / `AUTH_DENIED` |
| `result` | `SUCCESS` / `ERROR` |
| `resource_type` / `resource_id` | 대상 — `refund` + UUID |
| `admin_note` | 운영자 메모 또는 거절 사유 |
| `request_ip` / `user_agent` / `request_path` | 호출자 추적 |
| `error_message` | 실패 시 사유 |
| `created_at` | 시각 |

### 침해 의심 시 분석 쿼리

```sql
-- 최근 24시간 인증 실패
SELECT created_at, request_ip, user_agent, error_message
FROM admin_audit_log
WHERE action LIKE 'AUTH_%' AND result = 'ERROR'
  AND created_at >= NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- 같은 IP 가 짧은 시간에 여러 번 실패
SELECT request_ip, COUNT(*) AS failed_count, MIN(created_at), MAX(created_at)
FROM admin_audit_log
WHERE action LIKE 'AUTH_%' AND result = 'ERROR'
  AND created_at >= NOW() - INTERVAL '1 hour'
GROUP BY request_ip
HAVING COUNT(*) >= 3
ORDER BY failed_count DESC;

-- 특정 환불 작업 이력
SELECT created_at, action, result, request_ip, admin_note, error_message
FROM admin_audit_log
WHERE resource_type = 'refund' AND resource_id = '<refund-id>'
ORDER BY created_at;
```

### prod 마이그레이션 SQL

`ddl-auto=validate` 라 prod 에서 자동 생성 안 됨. backend 새 코드 배포 전에 EC2 에서 직접 실행 필요:

```sql
CREATE TABLE admin_audit_log (
    id UUID PRIMARY KEY,
    action VARCHAR(50) NOT NULL,
    result VARCHAR(20) NOT NULL,
    resource_type VARCHAR(30),
    resource_id UUID,
    admin_note VARCHAR(500),
    request_ip VARCHAR(45),
    user_agent VARCHAR(500),
    request_path VARCHAR(200),
    error_message VARCHAR(500),
    created_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_admin_audit_action ON admin_audit_log(action);
CREATE INDEX idx_admin_audit_resource ON admin_audit_log(resource_type, resource_id);
CREATE INDEX idx_admin_audit_created_at ON admin_audit_log(created_at);
CREATE INDEX idx_admin_audit_request_ip ON admin_audit_log(request_ip);
```

```bash
# EC2 에서 적용
docker exec -i folio-postgresql-prod psql -U folio -d folio < migration.sql
```

## 침해 의심 시 즉시 조치

1. **ADMIN_API_TOKEN 회전** (위 B 절차)
2. **EC2 backend 재기동** — 진행 중인 인증 세션 무효화
3. **최근 환불 이력 확인**:
   ```sql
   SELECT id, status, admin_note, processed_at, payment_id
   FROM refund
   WHERE processed_at >= NOW() - INTERVAL '24 hours'
   ORDER BY processed_at DESC;
   ```
4. **의심 환불 발견 시**:
   - PortOne 콘솔에서 결제 상태 직접 확인
   - 필요 시 결제 재처리 (PortOne 콘솔 → 재결제 안내)
   - 사용자에게 사정 설명 메일 발송

## Phase B (정식 출시 전 완성)

- [ ] `Writer.role=ADMIN` 기반 JWT 인증 — `X-Admin-Token` 단일 토큰 폐지
- [ ] AdminAuditLog 엔티티 + AOP 자동 기록 (resource snapshot before/after)
- [ ] PortOne outbox 패턴 + 자동 재시도 — 결과적 일관성에서 더 강한 보장으로
- [ ] (선택) 관리자 페이지 UI — 현재는 curl/API client 호출만
- [ ] (선택) Slack/Discord 알림 통합 — 이메일보다 즉시성

## 한 줄 요약

> 단일 토큰 인증 + Rate limit + 실패 알림 + 불일치 감지 + (인프라 옵션) IP 화이트리스트 = 알파/베타 단계 보안 최저선. Phase B 에서 role 기반 인증 + outbox 로 정식 출시 기준 완성.
