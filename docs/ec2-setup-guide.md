# Folio — EC2 서버 초기 설정 가이드

PEM 키로 SSH 접속 후 직접 수행해야 하는 작업의 단계별 가이드.

---

## 전제 조건

- EC2 인스턴스 생성 완료 (권장: t3.medium 이상, Ubuntu 22.04 또는 Amazon Linux 2023)
- PEM 키 파일 보유
- 보안 그룹 인바운드: 22(SSH), 80(HTTP), 443(HTTPS)
- 도메인 DNS A 레코드 → EC2 퍼블릭 IP

---

## 1. SSH 접속

```bash
# PEM 파일 권한 설정 (최초 1회)
chmod 400 folio-ec2.pem

# 접속
ssh -i folio-ec2.pem ubuntu@<EC2_PUBLIC_IP>
# Amazon Linux의 경우: ssh -i folio-ec2.pem ec2-user@<EC2_PUBLIC_IP>
```

---

## 2. Docker + Docker Compose 설치

### Ubuntu 22.04

```bash
# Docker 공식 저장소 추가
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 현재 사용자를 docker 그룹에 추가 (재로그인 필요)
sudo usermod -aG docker $USER
```

### Amazon Linux 2023

```bash
sudo dnf install -y docker
sudo systemctl enable docker && sudo systemctl start docker
sudo usermod -aG docker $USER

# Docker Compose v2 플러그인
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
```

### 확인

```bash
# 재로그인 후
docker --version
docker compose version
```

---

## 3. Doppler CLI 설치

```bash
# 설치
(curl -Ls --tlsv1.2 --proto "=https" --retry 3 https://cli.doppler.com/install.sh) | sudo sh

# 확인
doppler --version

# 서비스 토큰 설정 (CI/CD용 — 로그인 없이 사용)
# DOPPLER_TOKEN은 Doppler 대시보드에서 생성한 prd 서비스 토큰
export DOPPLER_TOKEN="dp.st.prd.xxxxxxxxxxxx"

# 확인
doppler secrets --project folio --config prd
```

> 서비스 토큰은 `/etc/environment` 또는 systemd 환경에 영구 등록 권장.

---

## 4. 디렉토리 구조 생성

```bash
sudo mkdir -p /opt/folio/{infra,data/{postgresql,mongodb,redis,certbot/{conf,www},backups}}
sudo chown -R $USER:$USER /opt/folio

# 초기 활성 색상
echo "blue" > /opt/folio/active-color
```

---

## 5. 프로��트 파일 배치

```bash
# 방법 1: Git clone (권장)
cd /opt/folio
git clone <GITLAB_REPO_URL> repo
ln -s /opt/folio/repo/infra /opt/folio/infra

# 방법 2: CI/CD에서 자동 배치 (GitLab Runner 사용 시)
# deploy job에서 스크립트가 /opt/folio/infra/ 경로를 직접 참조
```

---

## 6. GitLab Runner 설치 + 등록

```bash
# 설치 (Ubuntu)
curl -L "https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.deb.sh" | sudo bash
sudo apt-get install -y gitlab-runner

# Amazon Linux
curl -L "https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.rpm.sh" | sudo bash
sudo dnf install -y gitlab-runner

# Runner 등록
sudo gitlab-runner register \
  --non-interactive \
  --url "https://lab.ssafy.com/" \
  --registration-token "<REGISTRATION_TOKEN>" \
  --executor "shell" \
  --tag-list "deploy" \
  --description "folio-ec2-deploy-runner"

# gitlab-runner ��용자를 docker 그룹에 추가
sudo usermod -aG docker gitlab-runner
sudo systemctl restart gitlab-runner
```

> `<REGISTRATION_TOKEN>`은 GitLab → Settings → CI/CD → Runners에서 확인.

> executor를 `shell`로 설정하는 이유: deploy job이 호스트의 Docker 직접 제어 필요.

---

## 7. SSL 초기 인���서 발급

### 7-1. HTTP-only Nginx 기동

```bash
cd /opt/folio/infra/prod

# 초기용 nginx 설정 복사
cp nginx/nginx-init.conf nginx/nginx.conf.bak
cp nginx/nginx-init.conf nginx/nginx-active.conf

# upstream-active.conf 초기 생성 (blue 기본)
cp nginx/upstream-blue.conf nginx/upstream-active.conf

# 임시로 nginx-init.conf��� 사용하여 기동
docker compose -f docker-compose.yml up -d nginx
```

### 7-2. Certbot 인증서 발급

```bash
docker compose -f docker-compose.yml run --rm certbot \
  certonly --webroot \
  -w /var/www/certbot \
  -d <YOUR_DOMAIN> \
  --email <YOUR_EMAIL> \
  --agree-tos \
  --no-eff-email
```

### 7-3. 풀 HTTPS 설정으로 전환

```bash
# nginx.conf의 SSL 인증서 경로를 실제 도메인으로 수정
# ${FOLIO_DOMAIN:-folio.example.com} → 실제 도메인

# Nginx 재기동 (풀 HTTPS 설정)
docker compose -f docker-compose.yml restart nginx
```

---

## 8. 공유 서비스 최초 기동

```bash
cd /opt/folio/infra/prod

# Doppler에서 환경변수 다운로드
doppler secrets download --project folio --config prd --no-file --format env > .env

# 공유 서비스 기동
docker compose -f docker-compose.yml --env-file .env up -d

# 상태 확인
docker compose -f docker-compose.yml ps

# PostgreSQL 초기화 확인
docker exec folio-postgresql-prod psql -U folio -c "SELECT count(*) FROM information_schema.tables;"

# MongoDB replica set 확인
docker exec folio-mongo-prod mongosh --eval "rs.status()"

# 환경변수 파일 삭제
rm .env
```

---

## 9. 첫 Blue 배포

```bash
# deploy.sh로 최초 배포
bash /opt/folio/infra/scripts/deploy.sh latest

# 또는 수동으로:
cd /opt/folio/infra/prod
doppler secrets download --project folio --config prd --no-file --format env > .env
echo "DOCKER_REGISTRY=<registry-url>" >> .env
echo "IMAGE_TAG=latest" >> .env
docker compose -f docker-compose.yml -f docker-compose.blue.yml --env-file .env up -d
rm .env
```

---

## 10. 백업 Cron 등록

SSAFY EC2 환경 제약(외부 AWS 콘솔 접근 불가)으로 **로컬 디스크 전용 백업**.
스크립트는 [`infra/scripts/backup.sh`](../infra/scripts/backup.sh) 참조.
정책/복원/한계는 [deployment.md §7 백업·복원](./deployment.md#7-백업복원) 참조.

```bash
# 의존성 확인 — 모두 이미 설치되어 있어야 함 (다른 단계에서 설치됨)
which doppler   # Doppler CLI — 백업 실패 알람 메일용 INTERNAL_API_KEY 조회
which docker    # pg_dump / mongodump 실행

# (선택) jq 설치 — 알람 페이로드 escape 안전성 향상
sudo apt-get install -y jq

# 스크립트 실행 권한 보장 (git 에 chmod +x 박혀있지만 안전벨트)
chmod +x /opt/folio/infra/scripts/*.sh

# Doppler 서비스 토큰 발급 (prd config 의 ci-prd 토큰 재사용 가능)
#   - GitLab CI Variables 의 DOPPLER_TOKEN_PRD 값과 동일.
#   - 또는 Doppler 대시보드에서 새 서비스 토큰 발급.

# Cron 등록 — DOPPLER_TOKEN 은 crontab 줄에 직접 박는다 (cron 은 사용자
# 셸 환경변수를 상속하지 않음).
crontab -e
# 추가:
# 0 3 * * * DOPPLER_TOKEN=dt.st.xxxxxxxxxxxx /opt/folio/infra/scripts/backup.sh >> /opt/folio/data/backups/backup.log 2>&1

# 동작 확인 — 한 번 즉시 실행해서 결과 보기
DOPPLER_TOKEN=dt.st.xxxxxxxxxxxx /opt/folio/infra/scripts/backup.sh
ls -lh /opt/folio/data/backups/daily/
tail -50 /opt/folio/data/backups/backup.log
```

**테스트**: `pg_dump` 컨테이너 이름을 일부러 잘못 줘서 알람 메일이 오는지 1회 확인:
```bash
PG_CONTAINER=does-not-exist DOPPLER_TOKEN=dt.st.xxx /opt/folio/infra/scripts/backup.sh
# → 운영자 메일함에 "[Folio][backup] FAILED rc=..." 도착해야 정상
```

---

## 11. 보안 설정

### 방화벽 (AWS 보안 그룹)

| 포트 | 프로토콜 | 소스 | 용도 |
|------|---------|------|------|
| 22 | TCP | 관���자 IP만 | SSH |
| 80 | TCP | 0.0.0.0/0 | HTTP → HTTPS 리다이렉트 |
| 443 | TCP | 0.0.0.0/0 | HTTPS |

**노출하지 않을 포트**: 5432(DB), 6379(Redis), 27017(MongoDB), 8080-8092(앱 내부)

### SSH 보안

```bash
# 비밀번호 로그인 비활성화 확인
sudo grep "PasswordAuthentication" /etc/ssh/sshd_config
# → PasswordAuthentication no 이어야 함

# root 로그인 비활성화 확인
sudo grep "PermitRootLogin" /etc/ssh/sshd_config
# → PermitRootLogin no 이어야 함
```

### 자동 보안 업데이트

```bash
# Ubuntu
sudo apt-get install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

---

## 검증 체크리스트

- [ ] `docker --version` 출력 확인
- [ ] `docker compose version` 출력 확인
- [ ] `doppler --version` 출력 확인
- [ ] `/opt/folio/` 디렉토리 구조 생성 확인
- [ ] GitLab Runner가 GitLab UI에서 online으로 표시됨
- [ ] SSL 인증서 발급 성공 (`/opt/folio/data/certbot/conf/live/<domain>/`)
- [ ] 공유 서비스 모두 healthy (`docker compose ps`)
- [ ] 첫 배포 성공 (브라우저에서 HTTPS 접속 확인)
- [ ] 백업 cron 등록 및 수동 실행 테스트
- [ ] 보안 그룹에서 불필요한 포트 차단 확인

---

## 관련 문서

| 문서 | 내용 |
|------|------|
| [deployment.md](deployment.md) | ��포 아키텍처 + 운영 레퍼런스 |
| [gitlab-ci-guide.md](gitlab-ci-guide.md) | GitLab CI/CD 설정 가이드 |
| [doppler-setup.md](doppler-setup.md) | Doppler 환경변수 관리 |
