# 관리자 API 보안 강화 가이드

본 문서는 관리자 API(`/api/v1/admin/**`)에 대한 단기 보안 조치를 정리합니다. Phase B에서 `Writer.role=ADMIN` 기반 인증으로 강화하기 전까지 알파/베타 단계의 임시 방어책입니다.

## 위협 모델

`X-Admin-Token` 단일 토큰이 노출되면 누구든 환불 승인/거절 가능 → **사업적 손실 직접 발생**.

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
