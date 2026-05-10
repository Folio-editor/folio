# 정식 출시 인프라 — 비용 vs 리스크 트레이드오프

**대상 시점**: SSAFY 제공 EC2 만료 후 자체 운영 진입 시 (정식 출시 단계)
**관련 문서**: [production-rationale.md](./production-rationale.md) — 권장 구성 상세 근거

---

## 1. 핵심 메시지

> **정식 출시 목표면 월 $600~700이 합리적 시작점.**
> Multi-AZ + ALB + WAF + KMS + 매니지드 데이터 + S3는 양보 불가.
> 나머지는 RI / 단계적 확장으로 조정.
> 출시 즉시 풀 구성 가지 말고 **Stage 1($400)로 시작 → 트래픽 보고 Stage 2($615)로 확장**이 정석.

---

## 2. 비용 vs 리스크 매트릭스
 
각 절감 시도가 얼마를 아끼고, 그 대가로 어떤 리스크를 떠안는지 정리.

| 절감 시도 | 절감액 (월) | 리스크 |
|---|---|---|
| Multi-AZ 안 함 | -$70 | AZ 장애 시 다운, SLA 99.9% 달성 불가 |
| ALB → nginx | -$25 | 무중단 배포 불가, DDoS 노출, 인증서 직접 운영 |
| WAF 안 함 | -$10 | OWASP Top 10 공격 무방비 |
| GuardDuty 안 함 | -$20 | 침입 탐지 못 함, 사고 발견 지연 |
| RDS small (medium → small) | -$70 | 트래픽 증가 시 즉시 connection / work_mem 한계 |
| MongoDB Atlas M2 (M10 → M2) | -$50 | SLA 보장 부족, 단일 노드, 자동 백업 미흡 |
| Vault 자체 운영 (KMS 대신) | +$50 | 운영 부담, 단일 장애점, 컴플라이언스 입증 부담 |
| 모니터링 자체 호스팅 (SaaS 대신) | -$30 | 별도 호스트 필요, 운영 부담 |

---

## 3. 양보 불가 항목 — 절대 절감하지 말 것

정식 출시(상업 운영, 결제 처리, 사용자 데이터 보유) 시점에서는 다음 5가지가 **단순 비용이 아니라 사업 신뢰의 최저선**이다.

### 3.1 Multi-AZ
- **이유**: 99.9% SLA의 필수 조건. Single-AZ는 99.5%가 한계
- **절감 시 발생 시나리오**: AWS AZ 장애(연 1~2회) 시 전체 서비스 다운
- **대체 불가**: 어떤 운영 노력으로도 single-AZ에서 99.9%는 불가능

### 3.2 ALB
- **이유**: 무중단 배포 / ACM 자동 갱신 / Shield Standard / WAF 연동의 표준 진입점
- **절감 시 발생 시나리오**: 배포 시 다운타임, 인증서 만료 사고, DDoS 무방비
- **대체 불가**: nginx로 흉내 가능하지만 운영 부담 + AWS 보안 통합 끊김

### 3.3 WAF
- **이유**: 공개 = 자동화 봇 표적. SQL Injection 1건 = DB 노출 = 사업 종료급 사고
- **절감 시 발생 시나리오**: OWASP Top 10 공격 / 무차별 봇 가입 / Rate limit 우회
- **대체 불가**: AWS Managed Rules는 **$10/월에 24/7 보안팀 효과**

### 3.4 GuardDuty
- **이유**: 침입 탐지 자체 구축 시 SIEM + 보안 엔지니어 필요
- **절감 시 발생 시나리오**: 도난 IAM 키 사용 / 멀웨어 감염 / 데이터 유출 늦게 발견
- **대체 불가**: $20/월에 정직원 보안 분석가 24/7 감시 효과

### 3.5 KMS (Vault HA 대비)
- **이유**: 99.999% SLA + 컴플라이언스 인증 자동 충족 + 운영 부담 제로
- **절감 시 발생 시나리오**: Vault HA(EC2 3대) 운영 부담 / 단일 장애점 / 컴플라이언스 입증 부담
- **마이그레이션 비용**: KEK 파생 로직 1회 변경 → **영구 절감**

### 3.6 매니지드 데이터 (RDS / Atlas / ElastiCache)
- **이유**: 자동 백업 / PITR / Multi-AZ failover / 보안 패치 / 컴플라이언스 인증
- **절감 시 발생 시나리오**: 백업 실패 / 복구 불능 / 보안 패치 누락 / DB 단일 장애
- **대체 불가**: 자체 운영으로는 같은 가용성 / 안전성 달성 비용이 더 큼

### 3.7 S3 (백업 / 정적 호스팅 / 사용자 자산 / 로그 보관)
- **이유**: 재해 복구 마지막 안전망 + 컴플라이언스 (전자상거래법 거래 로그 1년 보관) + 사용자 업로드 보관
- **절감 시 발생 시나리오**:
  - DB 백업이 RDS 자동 백업에만 의존 → AWS 계정 침해 / 운영 실수 시 백업도 같이 삭제 → **데이터 영구 손실**
  - Vault snapshot 미보관 → KEK 손실 시 **모든 사용자 원고 영구 복구 불능**
  - 로그 장기 보관 누락 → 전자상거래법 위반 / 분쟁 시 증거 부재
  - 사용자 업로드를 DB BLOB로 → DB 비용 폭증 + 백업 시간 폭증
- **비용 영향**: 월 $10 내외 (Lifecycle 정책으로 Glacier/Deep Archive 자동 이동)
- **대체 불가**: AWS 내 사실상 표준. 다른 스토리지 서비스(EFS, EBS)로 대체 시 비용↑ + 기능 제한

---

## 4. 양보 가능한 항목 — 단계적 조정 가능

다음은 사업 단계 / 트래픽에 따라 조정 가능하며 **사업 신뢰에 직접 영향이 적다**.

### 4.1 모니터링 자체 호스팅 vs Grafana Cloud
- **자체**: t3a.small EC2 + Prom + Grafana + Loki ($20/월)
- **SaaS**: Grafana Cloud Pro ($49/월) — 운영 부담 0
- **선택 기준**: 결제/개인정보 메트릭이 외부 SaaS에 가는 것을 컴플라이언스 측면에서 받아들일 수 있는가
- **권장**: 자체 호스팅 + CloudWatch 알람 병행 (정식 운영엔 더 안전)

### 4.2 RI (Reserved Instance) 적용 여부
- **No Upfront 1년**: ~30% 할인
- **All Upfront 3년**: ~50%+ 할인
- **선택 기준**: 6개월 후 인스턴스 사양 변경 가능성, 현금 흐름
- **권장**: 안정 운영 진입 후 1년 RI 적용 (Stage 2 이후)

### 4.3 DR 리전 (Disaster Recovery)
- **있음**: RDS read replica를 다른 리전에 ($+50/월)
- **없음**: 같은 리전 내 Multi-AZ만
- **선택 기준**: SLA 목표 99.9% vs 99.95%+
- **권장**: 99.9% 목표면 생략, 출시 6개월 후 재검토

### 4.4 EC2 사양 단계
- t3a.large → xlarge → 2xlarge 순으로 트래픽에 따라 점진 증설
- 처음부터 큰 사양 갈 필요 없음 (Auto Recovery + 빠른 리사이즈로 대응)

---

## 5. 단계적 출시 전략 — 한 번에 풀 구성 가지 마라

### Stage 1 — 소프트 런칭 (출시 1~2개월) — 월 ~$400

**목적**: 초기 안정화, 실제 트래픽 패턴 관찰, 빠른 의사결정
**유지**: 양보 불가 항목 5종 (Multi-AZ는 RDS만 활성화 미루고 나머지는 적용)
**축소**:
- 앱 EC2 1대 (Auto Recovery로 대응)
- RDS Single-AZ로 시작 (콘솔에서 zero-downtime으로 Multi-AZ 전환 가능)
- ElastiCache Single-node
- DR 리전 생략

**커버 범위**: DAU 1,000~2,000

### Stage 2 — 안정 운영 (DAU 3,000+) — 월 ~$615

**목적**: 99.9% SLA 달성, Multi-AZ 가용성, 본 권장 구성
**전환 작업**:
- RDS Multi-AZ 활성화 (콘솔에서 zero-downtime modify)
- 앱 EC2 2대로 증설 + ALB target 추가
- ElastiCache Multi-AZ 활성화
- 1년 RI 적용 검토

**커버 범위**: DAU 3,000~10,000

### Stage 3 — 고가용성 (DAU 10,000+) — 월 ~$1,000+

**전환 작업**:
- backend → ECS Fargate (Auto Scaling)
- RDS read replica 추가
- DR 리전 (선택)

### Stage 4 — 글로벌/대규모 (DAU 50,000+) — 월 ~$3,000+

**전환 작업**:
- Multi-region active-active
- Aurora PostgreSQL 검토
- 전용 Celery worker fleet

---

## 6. 결정 체크리스트 — 출시 전 마지막 점검

다음 각 항목에 명시적으로 답해야 하며, "나중에 결정" 항목이 있으면 출시 위험.

### 양보 불가 5종 적용 여부
- [ ] Multi-AZ (RDS) — 활성화 시점은?
- [ ] ALB — 도메인 / ACM 인증서 / target group 구성 완료?
- [ ] WAF — Managed Rules + Rate limit 적용 완료?
- [ ] GuardDuty — 활성화 + 알람 채널 연결 완료?
- [ ] KMS — Vault Transit → KMS 마이그레이션 완료? 또는 Vault HA?

### Stage 1 시작 시 결정
- [ ] 모니터링: 자체 호스팅 vs Grafana Cloud Pro
- [ ] RI 적용 시점 (Stage 1 / Stage 2)
- [ ] DR 리전 도입 여부
- [ ] EC2 사양 (t3a.large 시작 / xlarge로 시작)

### Stage 2 전환 트리거 (사전 정의)
- [ ] DAU 3,000 도달 시 자동 전환?
- [ ] 또는 RDS CPU credit 70% 이하 지속 시?
- [ ] 또는 backend p95 latency > 500ms 5분 지속 시?

### 알람 / 백업 / 보안 (Stage 무관 필수)
- [ ] EC2 / RDS / Mongo / Redis CPU·메모리·storage 알람
- [ ] 결제 5xx 율 / webhook 처리 실패 알람
- [ ] RDS 자동 백업 30일 + S3 추가 백업
- [ ] Mongo + Vault snapshot 자동화
- [ ] Doppler / Vault / PortOne 토큰 로테이션 (이전 노출 분 포함)

---

## 7. 한 줄 결론

> **양보 불가 5종(Multi-AZ + ALB + WAF + GuardDuty + KMS)은 사업 신뢰의 최저선이며, 절감하는 순간 정식 출시가 아닌 베타 수준으로 회귀.**
> **Stage 1($400) 시작 → 트래픽 신호 보고 Stage 2($615) 전환**이 비용·리스크 균형점.
> 모니터링 / RI / DR 리전 / EC2 사양은 단계별 조정 가능 — 망설이지 말고 신호 보면 즉시 업그레이드.
