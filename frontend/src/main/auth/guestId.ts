import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// app.getPath('userData')는 모듈 로드 시점이 아닌 호출 시점에 평가되어야 한다.
// (appPaths.ts가 dev 모드에서 userData를 변경한 뒤에 읽혀야 하기 때문)
function guestIdFile(): string {
  return path.join(app.getPath('userData'), 'guest-id.txt');
}

/**
 * 게스트 UUID를 반환한다.
 * 파일이 없으면 새로 생성·저장한다.
 * 앱 재설치 전까지 동일한 UUID가 유지되어 로컬 데이터와 연결된다.
 */
export function getOrCreateGuestId(): string {
  const file = guestIdFile();
  try {
    if (fs.existsSync(file)) {
      const existing = fs.readFileSync(file, 'utf8').trim();
      if (existing) return existing;
    }
  } catch {
    /* 읽기 실패 시 새로 생성 */
  }

  const id = randomUUID();
  try {
    fs.writeFileSync(file, id, 'utf8');
  } catch {
    /* 쓰기 실패 시 메모리에만 유지 (앱 재시작 시 새로운 UUID) */
  }
  return id;
}

/**
 * 게스트 UUID 를 새 UUID 로 덮어쓴다.
 * 회원 탈퇴 시 호출 — 탈퇴를 "신규 게스트 모드 진입" 으로 명시 처리하기 위해 사용.
 */
export function rotateGuestId(): string {
  const file = guestIdFile();
  const id = randomUUID();
  try {
    fs.writeFileSync(file, id, 'utf8');
  } catch {
    /* 쓰기 실패 시 메모리에만 유지 */
  }
  return id;
}
