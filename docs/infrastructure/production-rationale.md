# 정식 출시 인프라 구성 — 근거 문서

**대상 시점**: SSAFY 제공 EC2 만료 후 (2026-06 예정), 상업 운영 시작
**목표 SLA**: 99.9% (월 다운타임 43분 이하)
**예상 워크로드**: DAU 5,000~10,000 / 결제 트랜잭션 수백 건/일
**월 비용**: ~$615 (1년 RI 적용 기준), RI 미적용 시 $735

---

## 1. 왜 이 구성이어야 하는가 — 핵심 명제

정식 출시는 **"한 명이라도 결제 실패하면 신뢰 잃는 단계"** 다. 알파/베타와 결정적으로 다른 점은 다음 4가지이며, 이 구성은 이 4가지를 모두 충족하기 위한 **최소선**이다.

| 영역 | 정식 출시에서 요구되는 수준 |
|---|---|
| **가용성** | 99.9% SLA (single-AZ로는 달성 불가) |
| **보안** | 결제/개인정보 처리에 따른 컴플라이언스 의무 발생 |
| **성능** | 트래픽 burst 흡수, p95 latency < 500ms 유지 |
| **데이터 무결성** | 결제 webhook 손실 0건, RPO 5분 이내 |

알파 단계에서 받아들였던 "안전 마진 0%" 구성은 정식 출시에서는 **단 한 번의 장애로 사업 신뢰가 회복 불가능한 손상을 입는 비용**이 절감액보다 훨씬 크다.

---

## 2. 계층별 구성과 근거

### 2.1 앱 계층 — ALB + EC2 × 2 (Multi-AZ) — $207/월

**구성:**
- ALB 1대, AZ 2개에 분산 — $25
- 앱 EC2 (t3a.xlarge, 4vCPU/16GB) × 2대, 다른 AZ — $260
- 1년 RI 30% 할인 — -$78
- 컨테이너: backend / ai / celery-worker / nginx + sidecar(promtail/cadvisor/node-exporter)
- 정적 파일(web/landing)은 S3 + CloudFront로 별도 분리

#### 왜 EC2 2대 / Multi-AZ인가

**99.9% SLA 달성의 필수 조건이다.** Single-AZ EC2 1대 구성의 이론적 가용성은 99.5% (월 3.6시간 다운타임)이며, 이는 다음 시나리오에 모두 노출된다:

1. **AWS AZ 장애** — 연 1~2회 발생. 단일 AZ면 그동안 서비스 전면 중단.
2. **EC2 인스턴스 장애** — Auto Recovery로 복구되지만 5~10분 다운타임.
3. **배포 시 다운타임** — 단일 인스턴스에서는 무중단 배포가 본질적으로 어렵다.
4. **OS 패치/재시작** — 보안 패치를 미루면 더 큰 리스크, 적용하면 다운타임.

2대 + Multi-AZ로 가면:
- 한 AZ 장애 시 ALB가 자동으로 다른 AZ로 traffic shift (수십 초)
- 한 인스턴스 죽어도 사용자는 인지 못 함
- ALB target group의 **rolling deploy**로 진짜 무중단 배포
- 패치도 한 대씩 순차 적용 가능

#### 왜 t3a.xlarge인가

현재 측정된 컨테이너 사용량은 평균 ~2.4GB이지만, 정식 운영에서는 다음 요인으로 메모리가 추가로 필요하다:

- backend JVM 힙 — 트래픽 증가 시 1.5~2GB까지 확장
- Hibernate L2 캐시, HikariCP 연결 풀 (50+ connections)
- Celery worker 동시성 증가 (4~8 worker 프로세스)
- AI 프록시 동시 요청 buffer
- sidecar 모니터링 agent

8GB(t3a.large)로 가면 사용률 50% 근처에 도달해 burst 여유가 부족하다. **16GB로 30% 사용률을 확보**하면 트래픽 2~3배 burst까지 안정적으로 흡수한다.

#### 왜 ALB인가 (EIP+nginx 대비)

ALB가 $25 더 비싸지만 다음을 자동으로 제공한다:

- **무중단 배포** — target group health check 기반 자동 교체
- **ACM 인증서 자동 갱신** — certbot 운영 부담 제거
- **AWS Shield Standard** 자동 적용 (L3/L4 DDoS 방어 무료)
- **WAF 연동 가능** (정식 출시에서는 필수)
- **헬스체크 기반 자동 인스턴스 교체**
- **Multi-AZ 트래픽 분산**의 표준 진입점

EIP+nginx로 절약하는 $20는 위 기능을 직접 구현/운영하는 시간 비용에 비해 무시할 수 있다.

---

### 2.2 데이터 계층 — Multi-AZ 매니지드 — $195/월

**구성:**
- RDS PostgreSQL Multi-AZ — db.t4g.medium, gp3 100GB, $130 (RI 35% 할인 후 $85)
- MongoDB Atlas M10 (Replica Set 3 노드) — $60
- ElastiCache Redis Multi-AZ — cache.t4g.small, $50

#### 왜 데이터는 절대 앱과 동거하면 안 되는가

1. **장애 격리** — 앱 OOM이 DB까지 죽이는 사슬 끊기
2. **리소스 경합** — JVM GC pause와 Postgres autovacuum이 같은 CPU/RAM 두고 다툼
3. **백업/PITR** — 매니지드는 자동, 자체는 직접 운영 + 검증 필요
4. **보안 격리** — 앱 컨테이너 침해 시 DB 직접 노출 vs 별도 VPC subnet
5. **확장성** — DB만 별도 스케일업 가능

#### 왜 RDS Multi-AZ인가

Single-AZ RDS는 다음 상황에서 다운된다:
- **AZ 장애** (앞서 언급)
- **인스턴스 장애** — RDS 자동 복구되지만 10~30분 소요
- **마이너 패치** — 다운타임 발생
- **storage 자동 확장** — 일시적 성능 저하

Multi-AZ는 **동기 복제 standby**가 다른 AZ에 항시 대기하며, failover 시 **60~120초** 내 자동 전환된다. 99.9% SLA의 데이터 계층 요건을 충족하는 사실상 유일한 옵션.

#### 왜 db.t4g.medium인가

DAU 5,000+ 워크로드에서 micro/small의 한계:

- **micro (1GB)**: connection 50개에 work_mem 8MB만 줘도 400MB 차지, shared_buffers와 충돌
- **small (2GB)**: PowerSync logical replication slot이 WAL 잡고 있으면 빡빡
- **medium (4GB)**: shared_buffers 1GB + work_mem × 50conn + WAL 버퍼 안정 영역

medium의 burstable CPU credit도 평균 부하에서 안정적으로 누적된다.

#### 왜 MongoDB Atlas M10인가

- M0 (무료): SLA 없음, 백업 없음, 공유 인스턴스 — 정식 운영 부적합
- M2 ($9): 단일 노드, replica set 없음 — 가용성 불충분
- **M10 ($60)**: Replica Set 3 노드 + 자동 백업 + SLA 99.95%

M10은 Atlas에서 **상업 운영 가능한 최저 사양**이다.

#### 왜 ElastiCache Multi-AZ인가

Redis가 휘발성 데이터라 가볍게 보지만, 정식 운영에서는 다음을 담는다:

- **Celery broker** — 결제 webhook, 백그라운드 잡 큐
- **session 캐시** — 분실 시 사용자 재로그인 강제
- **rate limit 카운터** — API 남용 방지

Single-node Redis가 죽으면:
- Celery 큐 손실 → 결제 후처리 실패 가능
- 모든 사용자 강제 로그아웃 → UX 재앙

Multi-AZ는 **자동 failover**와 **데이터 손실 0**을 보장한다.

---

### 2.3 보안/Secrets — AWS KMS — $10/월

**구성:**
- KMS CMK × 2 — $2
- API 호출 (월 100만) — $3
- AWS Secrets Manager — $5

#### 왜 KMS인가 (Vault 자체 운영 대비)

현재 Vault Transit Engine으로 KEK 파생 처리 중. 자체 운영 Vault HA를 정식 운영에서 유지하려면 **EC2 3대 (Raft 클러스터)**가 필요해 $60/월 + 운영 부담.

KMS로 마이그레이션 시:

| 항목 | Vault 자체 운영 | AWS KMS |
|---|---|---|
| 비용 | $60+/월 | $10/월 |
| HA 구성 | 직접 (Raft 3노드) | 자동 (99.999% SLA) |
| 패치/업그레이드 | 직접 | AWS 자동 |
| 백업 | snapshot 직접 | 자동 |
| 컴플라이언스 인증 | 직접 입증 필요 | SOC2/ISO27001/PCI 자동 |
| 코드 변경 | - | KEK 파생 로직 1회 변경 |

**한 번 마이그레이션 시 영구 절감** + 운영 부담 제거 + 컴플라이언스 자동 충족. 정식 출시 전 가장 우선순위 높은 작업 중 하나.

---

### 2.4 모니터링/관측성 — $40/월

**구성:**
- 모니터링 EC2 t3a.small (Prometheus + Grafana + Loki) — $20
- CloudWatch Logs + Insights — $15
- AWS X-Ray (분산 트레이싱) — $5

#### 왜 자체 호스팅 + CloudWatch 병행인가

**Grafana Cloud Pro ($49)는 좋지만 데이터가 외부에 보관**된다. 우리는:

- 결제 트랜잭션 로그
- 사용자 식별자가 포함된 메트릭
- KEK 파생 시도 로그 (보안 감사용)

이런 데이터를 외부 SaaS에 위탁하는 것이 한국 개인정보보호법 / PCI DSS 관점에서 부담이다. 자체 호스팅 + CloudWatch (AWS 내부 보관)이 컴플라이언스 측면에서 안전하다.

#### 정식 운영 필수 메트릭

- **결제 성공률** — 99% 미달 시 즉시 알람
- **webhook 처리 지연** — p95 > 5초 시 알람
- **KEK 파생 latency** — 보안 + 성능 추적
- **PowerSync replication lag** — 5초 이상 누적 시 알람
- **5xx 율, latency p95/p99** — SLA 측정

#### 왜 X-Ray인가

backend → AI 서버 → 외부 LLM API → DB 흐름이 복잡하다. 결제 같은 critical path에서 **어느 구간이 느린지** 즉시 식별 못 하면 장애 대응 시간이 폭발한다. X-Ray는 sampling 기반이라 비용 적고 효과 크다.

---

### 2.5 보안/컴플라이언스 — $50/월

**구성:**
- AWS WAF (ALB 앞) — $10
- AWS GuardDuty — $20
- AWS Config — $10
- Backup Vault (장기 보관) — $10

#### 왜 WAF인가

정식 출시 = 공개 = **자동화된 공격 봇 표적**이 된다. 알파 단계에서는 보안 사고가 나도 영향이 제한적이지만, 정식 운영에서는:

- SQL Injection 1건 → DB 노출 → 사업 종료급 사고
- XSS 1건 → 세션 탈취 → 신뢰 붕괴
- 무차별 회원가입 봇 → 서비스 마비 + 비용 폭증

AWS WAF Managed Rules는 **OWASP Top 10을 자동으로 차단**하며, Rate Limiting Rule로 봇 공격 방어. $10/월에 비해 **사고 1건 비용**이 압도적으로 크다.

#### 왜 GuardDuty인가

침입 탐지를 직접 구축하려면 SIEM 운영 + 보안 엔지니어 필요. GuardDuty는:

- **비정상 IAM 사용 패턴** 감지 (도난당한 access key 등)
- **EC2 → 알려진 악성 IP 트래픽** 감지 (멀웨어 감염)
- **암호화폐 채굴 패턴** 감지 (인스턴스 탈취)
- **DNS exfiltration** 감지 (데이터 유출)

$20/월에 정직원 보안 분석가의 24/7 감시 효과.

#### 왜 Config인가

정식 운영에서는 **누가 언제 무엇을 바꿨는지** 감사 로그가 필수다:

- 보안 그룹 변경 (DB 포트 0.0.0.0/0 노출 같은 사고 추적)
- IAM 정책 변경 (권한 상승 시도 추적)
- KMS key 정책 변경

이는 **법적 분쟁 / 침해 사고 조사 시 결정적 증거**가 된다.

#### PCI DSS 컴플라이언스

PortOne이 카드 정보 자체는 처리하지만, 우리는 **결제 트랜잭션 메타데이터, 사용자 식별자, 환불 이력**을 보관한다. 이 부분에 PCI DSS 일부 요구사항이 적용된다:

- 암호화 저장 (KMS로 충족)
- 접근 로깅 (CloudTrail + Config로 충족)
- 침입 탐지 (GuardDuty로 충족)
- 정기 보안 패치 (RDS/ALB 매니지드로 충족)

WAF + GuardDuty + Config 조합은 **PCI DSS 요구사항을 자동으로 충족**시키는 가장 비용 효율적인 방법이다.

---

### 2.6 CDN / 정적 호스팅 / DNS — $35/월

**구성:**
- CloudFront — $20
- S3 (정적 파일 + 백업) — $10
- Route 53 + 헬스체크 — $5

#### 왜 CloudFront 전체 트래픽 경유인가

- **정적 자산 캐싱** → 앱 EC2 부하 70%+ 감소
- **edge에서 TLS 종단** → latency 30~50ms 감소
- **AWS Shield Standard** → DDoS 추가 방어 (ALB와 이중)
- **글로벌 사용자** 응답 속도 개선
- **WAF 연동 가능**

비용 대비 가용성/성능/보안 모두 개선.

#### 왜 Route 53 헬스체크인가

ALB 자체가 죽거나 리전 장애 시 **DNS 레벨 failover**가 필요. Route 53 헬스체크 + failover 라우팅은 정식 운영의 마지막 안전망.

---

### 2.7 백업 / DR — $13/월 (DR 리전 제외)

**구성:**
- RDS 자동 백업 30일 보관 (포함)
- 추가 pg_dump → S3 → Glacier 1년 — $5
- Mongo 자동 백업 (M10 포함) + S3 — $3
- EBS 스냅샷 자동화 — $5

#### 왜 RDS 자동 백업만으로 부족한가

RDS 자동 백업은 **인스턴스가 살아있을 때만 유효**하다. 다음 시나리오에 무력하다:

- AWS 계정 자체 침해 → 백업도 같이 삭제
- 운영 실수로 RDS 인스턴스 + 자동 백업 동시 삭제
- 리전 전체 장애

추가 pg_dump → S3 → **다른 계정의 S3 버킷** + Glacier 장기 보관은 **재해 복구의 최후 보루**다. $5에 사업 영속성 보험.

#### DR 리전 (선택, +$50/월)

- 99.95%+ SLA 목표 시 필수
- 99.9% 목표 + 한국 사용자 중심이면 선택사항
- **출시 6개월 후 재검토** 권장

---

### 2.8 기타 운영비 — $65/월

**구성:**
- 데이터 전송 outbound — $20
- EBS gp3 추가 볼륨 — $10
- NAT Gateway — $35

#### 왜 NAT Gateway인가

DB는 **반드시 private subnet**에 배치해야 한다 (public 노출 시 즉각 공격 표적). 앱 EC2가 외부 API (Anthropic/OpenAI/PortOne) 호출하려면 NAT Gateway 필요.

VPC Endpoint로 일부 절감 가능하지만 (S3/DynamoDB 등), 외부 인터넷 호출은 NAT 필수. **보안 격리의 비용**으로 받아들여야 함.

---

## 3. 단계적 출시 전략 — 한 번에 풀 구성 가지 마라

정식 출시 day 1에 $615 풀 구성 갈 필요 없다. **트래픽 보면서 단계적 확장**.

### Stage 1 — 소프트 런칭 (출시 1~2개월) — 월 ~$400

- 앱 EC2 1대 + Auto Recovery
- RDS Single-AZ (downtime 없이 콘솔에서 Multi-AZ 전환 가능)
- ElastiCache Single-node
- WAF/GuardDuty/KMS는 **즉시 켜기** (보안 양보 불가)
- 커버: DAU 1,000~2,000

### Stage 2 — 안정 운영 (DAU 3,000+) — 월 ~$615

- 본 권장 구성으로 전환
- RDS Multi-AZ 활성화 (콘솔에서 zero-downtime modify)
- 앱 EC2 2대 + ALB target 추가
- ElastiCache Multi-AZ 활성화

### Stage 3 — 고가용성 (DAU 10,000+) — 월 ~$1,000+

- backend → ECS Fargate (Auto Scaling)
- RDS read replica
- DR 리전 (선택)

### Stage 4 — 글로벌/대규모 (DAU 50,000+) — 월 ~$3,000+

- Multi-region active-active
- Aurora PostgreSQL
- 전용 Celery worker fleet

---

## 4. 절감 시도와 그 대가

| 절감 시도 | 절감액 | 대가 |
|---|---|---|
| Multi-AZ 안 함 | -$70 | AZ 장애 시 다운, 99.9% SLA 불가 |
| ALB → nginx | -$25 | 무중단 배포 불가, DDoS 노출, 인증서 직접 운영 |
| WAF 안 함 | -$10 | OWASP 자동 공격 무방비 |
| GuardDuty 안 함 | -$20 | 침입 탐지 불가, 사고 늦게 발견 |
| RDS small | -$70 | 트래픽 늘면 즉시 한계, 마이그레이션 부담 |
| Mongo M2 | -$50 | SLA 보장 부족, 단일 노드 |
| Vault 자체 운영 | +$50 | 운영 부담, 단일 장애점, 컴플라이언스 부담 |
| 모니터링 SaaS | -$10 | 데이터 외부 보관 (컴플라이언스 부담) |

**양보 불가 항목:** Multi-AZ, ALB, WAF, GuardDuty, KMS, 매니지드 데이터
**조정 가능 항목:** RI 적용 여부, DR 리전, 모니터링 자체/SaaS, EC2 사양 단계

---

## 5. 출시 전 체크리스트

### 보안
- [ ] AWS root 계정 MFA + 사용 금지 (IAM 사용자만)
- [ ] **모든 시크릿 KMS/Secrets Manager 이전**
- [ ] **노출된 토큰 전부 로테이션**: Doppler, Vault, PortOne API Secret
- [ ] VPC private subnet에 DB 배치 (public 노출 금지)
- [ ] 보안 그룹 화이트리스트 최소화
- [ ] WAF rule set (AWS Managed + Rate Limit)
- [ ] GuardDuty 활성화

### 컴플라이언스
- [ ] 개인정보처리방침 정비 + 변호사 검토
- [ ] 이용약관 + 결제/환불 약관
- [ ] 개인정보보호법 준수 (회원가입 동의 로그, 탈퇴 처리 정책)
- [ ] PortOne 가맹점 PCI DSS 인증 확인
- [ ] 로그 보관 1년 이상 (전자상거래법)

### 가용성
- [ ] **백업 복구 실제로 한 번 해보기** (백업 있다고 복구 가능한 게 아님)
- [ ] 장애 대응 runbook (RDS down / 앱 down / webhook 실패)
- [ ] 알람 → 휴대폰 푸시 (SMS/Slack/Discord)
- [ ] 24시간 알람 수신 가능 상태

### 성능
- [ ] 부하 테스트 (k6/JMeter) — 예상 DAU 3배까지 처리
- [ ] DB 슬로우 쿼리 인덱스 점검
- [ ] CDN 캐시 hit rate 70%+
- [ ] backend p95 latency < 500ms

### 비즈니스 연속성
- [ ] 사업자 등록 + 통신판매업 신고
- [ ] 환불 프로세스 + UI
- [ ] CS 채널 (이메일 최소, 가능하면 채널톡)
- [ ] 결제 webhook 실패 수동 보정 절차

---

## 6. 한 줄 결론

> **정식 출시 = 알파의 안전 마진 0% 구성을 그대로 가져갈 수 없는 단계.**
> Multi-AZ + ALB + WAF + KMS + 매니지드 데이터, 이 5개는 양보 불가 항목이며, 월 $615는 **사업 신뢰를 지키는 최소 비용**이다.
> 단, Stage 1($400)로 시작 → 트래픽 보고 Stage 2($615) 전환이 정석.
