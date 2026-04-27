# 데스크탑 앱 자동 업데이트 가이드

> Folio 데스크탑 앱(Electron)이 새 버전을 어떻게 감지하고, 다운로드하고, 설치하는지에 대한 **처음 보는 사람용** 안내서.
> 이 가이드를 그대로 따라가면 **로컬에서 빌드 → 운영 서버에 업로드 → 사용자에게 배포**까지 끝낼 수 있다.

---

## 0. 큰 그림 (왜 이런 구조인가)

데스크탑 앱은 한 번 설치하면 사용자가 직접 새 버전을 받기 어렵다. 그래서 VSCode, Slack, Notion 같은 앱들은 **앱 안에서 자동으로** 새 버전을 감지하고, 사용자가 버튼을 누르면 다운로드/설치하도록 만든다.

Folio도 같은 방식이다. 핵심 도구는 **electron-updater** 라이브러리다. 이 라이브러리가 다음을 자동 처리해 준다:

- 우리가 정해 둔 URL에서 `latest.yml`(메타데이터 파일)을 GET
- 거기 적힌 버전이 현재 설치된 버전보다 높으면 "새 버전 있음" 이벤트 발화
- 명령 받으면 `.exe` 인스톨러를 다운로드하고 sha512 검증
- 명령 받으면 앱을 종료하고 NSIS silent 설치 → 자동 재시작

우리가 할 일은 두 가지뿐이다:
1. **빌드 산출물(.exe + .blockmap + latest.yml)을 운영 서버에 올리기**
2. **앱 안에서 사용자가 누를 버튼 UI 만들기** (이미 끝남 — TitleBar + 설정 화면)

---

## 1. 시스템 구성도

```
[사용자 PC: Folio 0.1.0 설치본]
       │
       │  앱 시작 / 온라인 복귀 / "업데이트 확인" 클릭
       │
       ▼
   GET https://folio-editor.co.kr/releases/win/latest.yml
       │
       │  (Nginx 정적 서빙)
       │
       ▼
[EC2: /opt/folio/releases/win/]
   ├─ latest.yml          ← 버전 메타데이터 (작은 텍스트 파일)
   ├─ Folio-0.1.1-Setup.exe       ← 새 버전 인스톨러
   ├─ Folio-0.1.1-Setup.exe.blockmap  ← 차등 업데이트용 청크 맵
   ├─ Folio-0.1.0-Setup.exe       ← 이전 버전 (롤백/차등 비교 대비 보존)
   └─ Folio-0.1.0-Setup.exe.blockmap
```

`latest.yml` 의 실제 내용 예시:
```yaml
version: 0.1.1
files:
  - url: Folio-0.1.1-Setup.exe
    sha512: 9q+abcdef...   # 다운로드 무결성 검증용 (electron-builder가 자동 생성)
    size: 87234567
path: Folio-0.1.1-Setup.exe
sha512: 9q+abcdef...
releaseDate: '2026-04-27T05:30:00.000Z'
```

이 파일이 핵심이다. 사용자 앱은 이걸 읽어서 자기 버전(0.1.0)과 비교한다.

---

## 2. 코드 흐름 (앱 내부에서 무슨 일이 일어나는가)

### 2-1. 사용자 동작 vs 자동 동작 분리

| 단계 | 누가 트리거? | 백그라운드인가? |
|---|---|---|
| 새 버전 **확인** (check) | **자동** — 앱 시작/온라인 복귀 시 1회 + 사용자 [업데이트 확인] 클릭 시 | latest.yml HTTP GET 한 번 (수 KB, 거의 무료) |
| **다운로드** (download) | **사용자 클릭만** (TitleBar 활성 버튼 또는 설정의 [지금 다운로드]) | .exe 수십~수백 MB |
| **설치 + 재시작** (install) | **사용자 클릭 + 2단계 확인** (설정의 [지금 재시작 후 설치] → [재시작 후 설치]) | 앱 종료 → NSIS 실행 |

이 분리는 [src/main/updater/updater.ts](../frontend/src/main/updater/updater.ts) 에서 두 줄로 보장된다:
```ts
autoUpdater.autoDownload = false;            // 발견만 하고 다운로드는 사용자 명령 후
autoUpdater.autoInstallOnAppQuit = false;    // 앱 종료 시에도 자동 설치 안 함
```

### 2-2. 메인 프로세스 (Electron Main)

[src/main/updater/updater.ts](../frontend/src/main/updater/updater.ts):
- `checkForUpdates()` — `electron-updater`의 `autoUpdater.checkForUpdates()` 호출. 결과는 이벤트로 도착.
- `downloadUpdate()` — `autoUpdater.downloadUpdate()` 호출. 진행률은 `download-progress` 이벤트로 들어옴.
- `installAndRestart()` — `autoUpdater.quitAndInstall(true, true)` 호출. silent 설치 + 자동 재시작.

상태 관리:
- 모든 상태 변화(`checking`, `available`, `downloading`, `downloaded`, `error`, `not-available`)는 `updater:state` IPC 이벤트로 모든 BrowserWindow에 broadcast.
- `app.isPackaged` 가 false(개발 빌드)면 `unsupported` 반환 → UI에서 비활성.

### 2-3. 렌더러 (React UI)

[src/shared/hooks/useUpdater.ts](../frontend/src/shared/hooks/useUpdater.ts):
- 마운트 시 `window.folio.updater.onStateChange(...)` 구독 → 메인의 broadcast를 그대로 받음.
- `check()`, `download()`, `installAndRestart()` 액션 노출.

UI 두 곳에서 사용:
1. **타이틀바 우측 빠른 진입 버튼** ([TitleBar.tsx](../frontend/src/shared/components/layout/TitleBar.tsx))
   - 오프라인 / 최신 / 확인 중 / 다운로드 중 → 비활성(채도 35%, cursor-not-allowed)
   - **새 버전 있음 / 다운로드 완료 / 에러** → 활성(풀 채도 + 닷 뱃지)
   - 새 버전 있을 때 클릭 → 즉시 `download()` 시작
   - 다운로드 완료 / 에러 클릭 → 설정→앱 정보 화면으로 이동
2. **설정 → 앱 정보 / 업데이트** ([AboutSettings.tsx](../frontend/src/shared/features/settings/AboutSettings.tsx))
   - 현재 버전 표시
   - 수동 [업데이트 확인]
   - 새 버전 정보 + 릴리스 노트 + [지금 다운로드]
   - 다운로드 진행률 (% / 속도 / 받은 용량 / 총 용량)
   - [지금 재시작 후 설치] → 확인 다이얼로그 → 실행

### 2-4. 설치 + 재시작이 진행되는 순간

`quitAndInstall(true, true)` 호출 시:
1. Electron이 `before-quit` 이벤트 발화 → 우리 코드의 `tokenRefreshScheduler.stop()` 등 정리 작업 실행 ([src/main/index.ts](../frontend/src/main/index.ts))
2. 앱 프로세스 종료
3. NSIS 인스톨러가 silent 모드로 실행 (사용자에게 마법사 UI 안 뜸)
4. 새 버전이 같은 위치에 덮어쓰기 설치
5. 새 버전이 자동 실행

> ⚠️ **저장되지 않은 작업은 손실 가능**: 그래서 AboutSettings에서 두 번째 클릭 시 경고 다이얼로그를 띄운다.

---

## 3. 배포 흐름 (한 번만 하는 사전 준비)

### 3-1. 운영 서버에 디렉터리 만들기

EC2에 SSH로 접속:
```bash
ssh -i ~/.ssh/folio.pem ubuntu@<EC2_HOST>
```

릴리스 디렉터리 생성:
```bash
sudo mkdir -p /opt/folio/releases/win
sudo chown -R ubuntu:ubuntu /opt/folio/releases
sudo chmod 755 /opt/folio/releases /opt/folio/releases/win
```

확인:
```bash
ls -la /opt/folio/releases/
# drwxr-xr-x ... ubuntu ubuntu ... win
```

### 3-2. Nginx에 `/releases/` 라우트 활성화

이번 작업에 포함된 변경사항을 운영 서버에 반영:

1. **소스 최신화** (master 브랜치가 자동 배포되므로 PR 머지 후 자동 반영, 또는 수동):
   ```bash
   cd /opt/folio/S14P31F203
   git pull origin master
   ```

2. **Nginx 컨테이너 재기동** (volumes 마운트가 추가됐으므로 재생성 필요):
   ```bash
   cd /opt/folio/S14P31F203/infra/prod
   docker compose -f docker-compose.yml up -d nginx
   ```
   `up -d nginx` 는 다른 서비스는 건드리지 않고 nginx 컨테이너만 새 설정으로 재생성한다.

3. **검증**:
   ```bash
   # 디렉터리 자체는 autoindex off라 404가 정상
   curl -I https://folio-editor.co.kr/releases/win/
   # → HTTP/2 404

   # 아직 파일 안 올렸으니 latest.yml도 404 (정상)
   curl -I https://folio-editor.co.kr/releases/win/latest.yml
   # → HTTP/2 404
   ```

   200이 떠야 하는 건 파일을 올린 이후. 지금은 404가 정상이다.

---

## 4. 새 버전 릴리스 절차 (반복)

이 절차는 **새 버전을 사용자에게 배포할 때마다** 수행한다. **Windows 머신**에서 실행해야 한다(NSIS는 Windows에서만 빌드 가능).

### 4-1. 버전 번호 올리기

[frontend/package.json](../frontend/package.json) 의 `version` 필드를 수정한다:
```json
{
  "name": "folio",
  "productName": "Folio",
  "version": "0.1.1",   // ← 0.1.0 → 0.1.1
  ...
}
```

[Semver](https://semver.org/lang/ko/) 규칙:
- 버그 픽스: 0.1.0 → **0.1.1**
- 신기능 추가(호환): 0.1.1 → **0.2.0**
- 호환 깨지는 변경: 0.x.y → **1.0.0**

> 처음에는 0.1.x로 자잘하게 올리면서 흐름에 익숙해지자.

이 변경을 커밋하고 push:
```bash
git add frontend/package.json
git commit -m "chore: bump version to 0.1.1"
git tag v0.1.1
git push origin master --tags
```

> **태그를 같이 push하라**: 어떤 커밋이 어느 버전인지 나중에 추적할 때 매우 유용하다.

### 4-2. 빌드

Windows 머신의 `frontend/` 디렉터리에서:

```bash
cd frontend
pnpm install        # package.json 변경 후 첫 번째라면 필수
pnpm build:win
```

빌드가 성공하면 `frontend/release/` 디렉터리에 다음 파일들이 생긴다:

```
frontend/release/
├── Folio-0.1.1-Setup.exe              ← 약 80~150MB
├── Folio-0.1.1-Setup.exe.blockmap     ← 차등 업데이트 청크 맵
├── latest.yml                         ← 메타데이터 (수 KB)
└── ... (그 외 디버그 산출물 — 무시)
```

이 **3개 파일**이 업로드 대상이다.

> **주의: `release/` 디렉터리는 절대 git에 커밋하지 마라**. 바이너리는 가볍지 않고, GitLab 푸시가 거부될 수 있다. `.gitignore`에 이미 등록되어 있을 것이지만 한번 확인:
> ```bash
> grep -n "release" frontend/.gitignore
> ```

### 4-3. 운영 서버에 업로드

같은 Windows 머신(또는 빌드 산출물이 있는 어떤 머신이든)에서:

```bash
# Git Bash / PowerShell / WSL 어디서든 동작
scp -i ~/.ssh/folio.pem \
    frontend/release/Folio-0.1.1-Setup.exe \
    frontend/release/Folio-0.1.1-Setup.exe.blockmap \
    frontend/release/latest.yml \
    ubuntu@<EC2_HOST>:/opt/folio/releases/win/
```

> ⚠️ **순서가 중요하다**: scp는 인자 순서대로 업로드한다. 위 명령어처럼 **`.exe` → `.blockmap` → `latest.yml` 순서**로 적어라. 만약 `latest.yml`이 먼저 올라가면, 그 사이에 사용자가 [업데이트 확인]을 누를 경우 "있다고 했는데 다운로드 실패"가 날 수 있다.

업로드 후 EC2에서 확인:
```bash
ssh -i ~/.ssh/folio.pem ubuntu@<EC2_HOST>
ls -la /opt/folio/releases/win/
# -rw-r--r-- 1 ubuntu ubuntu      512 ... latest.yml
# -rw-r--r-- 1 ubuntu ubuntu 87234567 ... Folio-0.1.1-Setup.exe
# -rw-r--r-- 1 ubuntu ubuntu  1234567 ... Folio-0.1.1-Setup.exe.blockmap
```

### 4-4. 외부에서 접근 검증

자신의 PC에서:
```bash
curl https://folio-editor.co.kr/releases/win/latest.yml
```

다음과 비슷하게 출력되면 성공:
```yaml
version: 0.1.1
files:
  - url: Folio-0.1.1-Setup.exe
    sha512: ...
    size: 87234567
path: Folio-0.1.1-Setup.exe
sha512: ...
releaseDate: '2026-04-27T...'
```

**이 시점부터 모든 사용자의 0.1.0 설치본이 0.1.1로 업데이트 가능해진다.**

### 4-5. End-to-End 검증

1. 사전에 만들어둔 **0.1.0 설치본**을 띄운다 (이전 버전을 따로 보관해 두면 좋다).
2. 타이틀바 우측의 업데이트 버튼 확인:
   - 처음엔 회색(확인 중) → **파란 닷 + 다운로드 아이콘**으로 변하면 새 버전 발견 성공.
3. 그 버튼을 클릭 → 회전 스피너로 변함(다운로드 중).
4. 설정 → 앱 정보 / 업데이트 진입 → 진행률 확인 (속도, 전송량 표시).
5. 100% 완료 → 타이틀바 아이콘이 **초록 닷 + RotateCw 아이콘**으로 변경.
6. 그 버튼 클릭 → 설정 화면으로 이동 → [지금 재시작 후 설치] → [재시작 후 설치].
7. 앱 종료 → NSIS 자동 설치 → 새 버전이 자동 실행.
8. 다시 설정 → 앱 정보에서 버전이 **0.1.1**로 표시되면 성공.

---

## 5. 트러블슈팅

### 5-1. "업데이트 확인" 후에도 항상 "최신 버전입니다" 라고 뜨는 경우

원인 후보:
- `latest.yml`이 운영 서버에 없거나, 그 안의 `version`이 현재 설치된 버전과 같거나 낮음.
- nginx 마운트가 반영 안 됨 (`docker compose up -d nginx` 빠뜨림).
- DNS / TLS 문제로 `https://folio-editor.co.kr/releases/win/latest.yml` 접근 자체가 안 됨.

진단:
```bash
# 1) 외부에서 yml 접근되는지
curl -v https://folio-editor.co.kr/releases/win/latest.yml

# 2) 컨테이너 안에서 마운트 보이는지
docker exec folio-nginx ls -la /usr/share/nginx/releases/win/

# 3) 앱의 메인 프로세스 로그 확인
# 설치된 앱을 터미널에서 실행하면 stdout 로그가 보인다 (Windows: PowerShell에서 직접 실행)
& "C:\Program Files\Folio\Folio.exe"
```

### 5-2. "다운로드 실패" 에러

원인 후보:
- `.exe` 파일이 운영 서버에 안 올라감 (yml만 올림).
- sha512가 안 맞음 (파일 손상). → 다시 빌드해서 다시 올려라.
- 디스크 권한 문제 — 사용자 PC의 `%LOCALAPPDATA%\Folio\` 에 쓰기 권한 없음.

진단:
- 앱 메인 로그에서 어떤 URL을 GET 시도하는지 확인.
- `curl -I https://folio-editor.co.kr/releases/win/Folio-0.1.1-Setup.exe` 직접 다운로드 시도 — 200이 떠야 함.

### 5-3. "재시작 후 설치"를 눌렀는데 새 버전이 아닌 기존 버전이 다시 뜨는 경우

원인 후보:
- 인스톨러가 다른 경로에 설치됐을 가능성 (사용자가 이전에 설치할 때 경로를 바꿨다면).
- 안티바이러스가 NSIS 자동 실행을 차단.

진단:
- Windows 작업 관리자로 `Folio.exe` 프로세스 경로 확인.
- 사용자에게 이전 버전을 수동 제거 후 새 인스톨러로 재설치하도록 안내.

### 5-4. SmartScreen 경고 ("게시자를 알 수 없습니다")

원인: **코드 사이닝 인증서가 없음**. 정상이다.

처리:
- 사용자에게 "추가 정보" → "실행" 클릭 안내.
- 자동 업데이트 자체는 sha512 검증으로 안전 — SmartScreen 경고는 시각적 경고일 뿐이고, sha512 무결성 체크는 항상 동작한다.
- 향후 EV(Extended Validation) 코드 사이닝 인증서를 구매하면 이 경고가 사라진다 (별도 트랙).

---

## 6. 자주 묻는 질문

### Q. 사용자가 자동 업데이트를 끌 수 있나?
A. 현재 구현은 **확인(check)만 자동**, **다운로드/설치는 항상 사용자 클릭**. 즉 사용자는 그냥 버튼을 누르지 않으면 아무 일도 안 일어난다. 따로 ON/OFF 토글은 두지 않았다. 필요해지면 설정에 추가 가능.

### Q. 차등 업데이트(differential)는 어떻게 동작하나?
A. `electron-builder.yml`의 `differentialPackage: true` 덕분에, blockmap을 비교해 변경된 청크만 다운로드한다. 80MB 인스톨러 중 10MB만 바뀌었다면 사용자는 ~10MB만 받는다. **이전 버전의 `.exe`와 `.blockmap`을 운영 서버에 보존해 두는 게 중요한 이유**다.

### Q. macOS 사용자는 어떻게 하나?
A. macOS 자동 업데이트는 Apple Developer ID 코드 사이닝 + notarization이 필수다. 인증서 미보유 상태이므로 현재 macOS 자동 업데이트는 비활성. macOS 사용자는 새 .zip을 직접 다운로드해 교체해야 한다.

### Q. 빌드를 자동화할 수 있나?
A. 가능하다. 다음 단계로 GitLab CI에 Windows runner를 추가하거나 GitHub Actions의 `windows-latest`로 미러 빌드를 돌려 자동 업로드까지 만들 수 있다. **지금은 일부러 수동 절차를 유지** — 흐름이 익숙해진 후 자동화하는 게 안전하다.

### Q. 잘못된 버전을 올렸을 때 롤백은?
A. 두 가지 방법:
1. **`latest.yml`만 이전 버전 것으로 되돌린다** (이전 .exe는 보존되어 있어야 함). 사용자는 다음 check 시 "최신 버전입니다"로 표시되거나 이전 버전으로 다운그레이드 표시.
2. **새 버전을 핫픽스로 또 올린다** (0.1.1 → 0.1.2). 1번보다 안전하다 — 다운그레이드는 electron-updater 기본 동작이 아니다.

권장: **항상 핫픽스로 진행**.

---

## 7. 핵심 파일 빠른 레퍼런스

| 파일 | 역할 |
|---|---|
| [frontend/package.json](../frontend/package.json) | 버전 번호. 매 릴리스마다 bump |
| [frontend/electron-builder.yml](../frontend/electron-builder.yml) | publish 설정 (피드 URL) |
| [frontend/src/main/updater/updater.ts](../frontend/src/main/updater/updater.ts) | 메인 프로세스 autoUpdater 래퍼 |
| [frontend/src/main/updater/index.ts](../frontend/src/main/updater/index.ts) | IPC 핸들러 등록 |
| [frontend/src/main/preload.ts](../frontend/src/main/preload.ts) | `window.folio.updater` 노출 |
| [frontend/src/shared/types/auth.ts](../frontend/src/shared/types/auth.ts) | `UpdaterState`, `FolioUpdaterApi` 타입 |
| [frontend/src/shared/hooks/useUpdater.ts](../frontend/src/shared/hooks/useUpdater.ts) | 렌더러 상태/액션 훅 |
| [frontend/src/shared/components/layout/TitleBar.tsx](../frontend/src/shared/components/layout/TitleBar.tsx) | 빠른 진입 버튼 |
| [frontend/src/shared/features/settings/AboutSettings.tsx](../frontend/src/shared/features/settings/AboutSettings.tsx) | 풀 UI (진행률, 릴리스 노트, 재시작) |
| [infra/prod/nginx/nginx.conf](../infra/prod/nginx/nginx.conf) | `/releases/` location 정의 |
| [infra/prod/docker-compose.yml](../infra/prod/docker-compose.yml) | nginx 컨테이너에 호스트 디렉터리 마운트 |

---

## 8. 한 줄 체크리스트 (다음 번에 릴리스할 때)

1. ☐ `frontend/package.json`의 `version`을 0.1.x → 0.1.(x+1)로 bump
2. ☐ git 커밋 + tag `v0.1.(x+1)` + push
3. ☐ Windows에서 `cd frontend && pnpm install && pnpm build:win`
4. ☐ `frontend/release/` 안의 `.exe` + `.blockmap` + `latest.yml` 3개 파일 확인
5. ☐ `scp` 로 EC2의 `/opt/folio/releases/win/` 에 업로드 (.exe → .blockmap → latest.yml 순서)
6. ☐ `curl https://folio-editor.co.kr/releases/win/latest.yml` 로 외부 접근 확인
7. ☐ 0.1.0 설치본을 띄워 실제 업데이트가 발견되는지 e2e 테스트
8. ☐ 사용자 공지 (선택)

이 순서대로만 하면 된다. 익숙해지면 5분 안에 끝난다.
