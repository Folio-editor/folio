# Folio — GitLab CI/CD 설정 가이드

GitLab 웹 UI에서 설정해야 하는 항목과 파이프라인 동작 설명.

## 아키텍처

```
lab.ssafy.com 공유 Runner          EC2 서버
┌────────────────────┐            ┌──────────────────┐
│  test (lint/test)  │            │                  │
│  build (Docker     │──── SSH ──→│  docker pull     │
│        image push) │  (PEM 키)  │  docker compose  │
│  deploy (SSH 접속) │            │  Blue/Green 전환 │
└────────────────────┘            └──────────────────┘
```

- **test/build**: lab.ssafy.com 공유 Runner에서 실행 (Docker executor)
- **deploy**: 공유 Runner에서 SSH로 EC2에 접속하여 배포 명령 실행
- **PEM 키**: GitLab CI Variable (File 타입)에 저장 → deploy job에서 SSH 인증에 사용

---

## 1. 사전 준비 (GitLab UI에서 설정)

### 1-1. Container Registry 확인

GitLab 프로젝트 좌측 메뉴에서 `Packages & Registries` → `Container Registry` 확인.

- 메뉴가 보이면 → 이미 활성화됨
- 메뉴가 없으면 → GitLab admin에게 활성화 요청

이미지 주소 형식: `lab.ssafy.com:5050/s14-final/S14P31F203/<image-name>:<tag>`

### 1-2. Deploy Token 생성 (EC2에서 이미지 pull용)

GitLab → `Settings` → `Repository` → `Deploy tokens`

| 항목 | 값 |
|------|-----|
| Name | `ec2-registry-pull` |
| Scopes | `read_registry` 체크 |

생성 후 **username**과 **token** 값을 복사해둔다 (한 번만 보임).

### 1-3. CI/CD Variables 등록

GitLab → `Settings` → `CI/CD` → `Variables` → `Add variable`

**PEM 키 등록 (가장 중요):**

| Key | Type | Value | Options |
|-----|------|-------|---------|
| `SSH_PRIVATE_KEY` | **File** | PEM 파일 내용 전체 붙여넣기 (`-----BEGIN...` ~ `-----END...`) | Protected |

> **반드시 File 타입**으로 등록해야 한다. Variable 타입으로 하면 줄바꿈이 깨져서 `Load key: invalid format` 에러 발생.

**나머지 변수:**

| Key | Type | Value | Options |
|-----|------|-------|---------|
| `EC2_HOST` | Variable | EC2 퍼블릭 IP (예: `3.35.xxx.xxx`) | Protected |
| `EC2_USER` | Variable | `ubuntu` (Ubuntu AMI) 또는 `ec2-user` (Amazon Linux) | Protected |
| `DEPLOY_TOKEN_USER` | Variable | Deploy Token 사용자명 (1-2에서 복사) | Protected |
| `DEPLOY_TOKEN_PASS` | Variable | Deploy Token 비밀번호 (1-2에서 복사) | Protected, Masked |
| `DOPPLER_TOKEN_PRD` | Variable | Doppler prd 서비스 토큰 | Protected, Masked |
| `VITE_API_URL` | Variable | `https://<folio-domain>/api` | Protected |
| `VITE_POWERSYNC_URL` | Variable | `https://<folio-domain>/sync` | Protected |
| `VITE_GOOGLE_CLIENT_ID` | Variable | Google OAuth Web Client ID | Protected |

> `CI_REGISTRY`, `CI_REGISTRY_USER`, `CI_REGISTRY_PASSWORD`, `CI_REGISTRY_IMAGE`는 GitLab이 자동 제공.

### 1-4. Doppler Service Token 발급

Doppler 대시보드:
1. `folio` 프로젝트 → Access → Service Tokens
2. `ci-prd` 토큰 생성 (config: prd)
3. 값을 `DOPPLER_TOKEN_PRD`에 등록

### 1-5. 브랜치 보호 규칙

GitLab → `Settings` → `Repository` → `Protected branches`:
- `master`: Maintainers만 push + merge
- `develop`: Developers 이상 merge 가능

> Protected 브랜치에서만 Protected CI Variables가 주입됨. PEM 키, Deploy Token 등이 feature 브랜치에서는 사용 불가 (보안상 정상).

---

## 2. EC2 사전 준비

EC2에 SSH 접속 후 아래 항목을 확인:

```bash
# Docker 설치 확인
docker --version
docker compose version

# Doppler CLI 설치 확인
doppler --version

# /opt/folio/ 디렉토리 확인
ls /opt/folio/

# 프로젝트 clone 확인
ls /opt/folio/repo/infra/

# Container Registry 로그인 테스트 (Deploy Token 사용)
docker login lab.ssafy.com:5050 -u <deploy-token-user> -p <deploy-token-pass>
```

상세 설정은 [ec2-setup-guide.md](ec2-setup-guide.md) 참고.

---

## 3. 파이프라인 구조

### 3단계 파이프라인

```
test → build → deploy
```

### 브랜치별 실행 범위

| 브랜치 | test | build | deploy |
|--------|:----:|:-----:|:------:|
| feature/* (MR) | O | X | X |
| develop | O | O | X |
| master | O | O | O (수동 트리거) |

### 각 Job 상세

#### `test-frontend` / `test-backend` / `test-ai` (test stage)
- **실행 위치**: lab.ssafy.com 공유 Runner
- **동작**: 린트 + 단위 테스트
- **실패 시**: MR merge 차단

#### `build-spring` / `build-fastapi` / `build-web` (build stage)
- **실행 위치**: lab.ssafy.com 공유 Runner (Docker-in-Docker)
- **동작**: Dockerfile 빌드 → Container Registry push
- **이미지 태그**: `<commit-sha>` + `latest`
- **build-web 주의**: `VITE_*` 변수가 CI Variables에 등록되어 있어야 함

#### `deploy-production` (deploy stage)
- **실행 조건**: master push + **수동 클릭** (`when: manual`)
- **실행 위치**: lab.ssafy.com 공유 Runner
- **동작**:
  1. `alpine` 이미지에서 openssh-client 설치
  2. PEM 키(`$SSH_PRIVATE_KEY`)로 EC2에 SSH 접속
  3. EC2에서 Container Registry 로그인 (Deploy Token)
  4. 새 이미지 pull → Blue/Green 전환 → 헬스체크
  5. 실패 시 자동 롤백 (이전 색상 유지)

---

## 4. PEM 키 동작 원리

```yaml
# .gitlab-ci.yml의 deploy job 핵심 부분
deploy-production:
  image: alpine:latest
  before_script:
    - apk add --no-cache openssh-client      # SSH 클라이언트 설치
    - chmod 400 $SSH_PRIVATE_KEY              # PEM 키 권한 설정
    - mkdir -p ~/.ssh
    - ssh-keyscan -H $EC2_HOST >> ~/.ssh/known_hosts  # 호스트 키 등록
  script:
    - ssh -i $SSH_PRIVATE_KEY $EC2_USER@$EC2_HOST << ENDSSH
        # 이 안의 명령은 EC2에서 실행됨
        docker pull ...
        docker compose up -d ...
      ENDSSH
```

**흐름:**
1. GitLab이 `$SSH_PRIVATE_KEY` (File 타입) 내용을 임시 파일에 쓰고, 변수에 파일 경로 설정
2. `chmod 400`으로 권한 제한 (SSH 필수)
3. `ssh -i $SSH_PRIVATE_KEY`로 해당 파일을 키로 사용하여 EC2 접속
4. heredoc(`<< ENDSSH`)으로 EC2에서 실행할 배포 명령 전달

---

## 5. 파이프라인 실행 방법

### 자동 실행

- feature 브랜치에서 MR 생성 → **test만** 자동 실행
- develop에 merge → **test + build** 자동 실행
- master에 merge → **test + build** 자동 실행, deploy는 수동 대기

### 배포 수동 트리거

1. GitLab → `CI/CD` → `Pipelines` → master 브랜치 최신 파이프라인 클릭
2. `deploy-production` job 옆 ▶ 버튼 클릭
3. 배포 진행 상황은 job 로그에서 실시간 확인

### 수동 파이프라인 실행

GitLab → `CI/CD` → `Pipelines` → `Run pipeline` → 브랜치 선택 → `Run`

---

## 6. 문제 해결

### SSH 연결 실패: `Permission denied (publickey)`

```
Warning: Identity file /builds/.../SSH_PRIVATE_KEY not accessible
```

- `SSH_PRIVATE_KEY`가 **File** 타입인지 확인 (Variable 타입이면 안 됨)
- PEM 내용이 완전한지 확인 (`-----BEGIN...` ~ `-----END...` 포함)
- EC2 보안 그룹에서 22번 포트가 열려 있는지 확인
- EC2_USER가 올바른지 확인 (ubuntu vs ec2-user)

### SSH 연결 실패: `Host key verification failed`

`before_script`에 `ssh-keyscan` 명령이 있는지 확인:
```yaml
- ssh-keyscan -H $EC2_HOST >> ~/.ssh/known_hosts 2>/dev/null
```

### Docker build 실패: DinD 관련

```
Cannot connect to the Docker daemon
```

lab.ssafy.com 공유 Runner가 Docker-in-Docker를 지원하는지 확인.
지원하지 않으면 `kaniko` 빌드로 전환 필요:

```yaml
build-spring:
  stage: build
  image:
    name: gcr.io/kaniko-project/executor:v1.23.0-debug
    entrypoint: [""]
  script:
    - >
      /kaniko/executor
      --context ./backend
      --dockerfile infra/dockerfiles/Dockerfile.spring
      --destination $CI_REGISTRY_IMAGE/folio-backend:$IMAGE_TAG
```

### 이미지 Push 권한 없음

```
unauthorized: access forbidden
```

- Container Registry가 활성화되었는지 확인
- `$CI_REGISTRY_USER`, `$CI_REGISTRY_PASSWORD`는 GitLab이 자동 제공 — 직접 등록 불필요

### EC2에서 이미지 Pull 실패

```bash
# EC2에서 직접 테스트
docker login lab.ssafy.com:5050 -u <deploy-token-user> -p <deploy-token-pass>
docker pull lab.ssafy.com:5050/s14-final/S14P31F203/folio-backend:latest
```

- Deploy Token의 scope에 `read_registry`가 포함되어 있는지 확인
- Token이 만료되지 않았는지 확인

### build-web에서 VITE_* 변수가 비어 있음

CI Variables에 `VITE_API_URL`, `VITE_POWERSYNC_URL` 등록 확인.
**Protected** 옵션이 켜져 있으면 protected 브랜치(master, develop)에서만 주입됨.

### deploy에서 Doppler 명령 실패

EC2에 Doppler CLI가 설치되어 있고, 서비스 토큰이 등록되어 있는지 확인:
```bash
ssh -i <pem> ubuntu@<ec2-ip> "doppler --version"
```

---

## 7. 유용한 명령어

```bash
# EC2에서 현재 배포 상태 확인
ssh -i <pem> ubuntu@<ec2-ip> "cat /opt/folio/active-color"
ssh -i <pem> ubuntu@<ec2-ip> "docker ps --format 'table {{.Names}}\t{{.Status}}'"

# 특정 서비스 로그 (실시간)
ssh -i <pem> ubuntu@<ec2-ip> "docker logs -f folio-backend-blue --tail 100"

# 수동 롤백 (EC2 접속 후)
cd /opt/folio/infra/prod
CURRENT=$(cat /opt/folio/active-color)
PREV=$( [ "$CURRENT" = "blue" ] && echo "green" || echo "blue" )
cp nginx/upstream-${PREV}.conf nginx/upstream-active.conf
docker compose -f docker-compose.yml exec -T nginx nginx -s reload
echo "$PREV" > /opt/folio/active-color
```

---

## 관련 문서

| 문서 | 내용 |
|------|------|
| [deployment.md](deployment.md) | 배포 아키텍처 + 운영 레퍼런스 |
| [ec2-setup-guide.md](ec2-setup-guide.md) | EC2 초기 설정 가이드 |
| [doppler-setup.md](doppler-setup.md) | Doppler 환경변수 관리 |
