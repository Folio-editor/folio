import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const GUEST_ID_FILE = path.join(app.getPath('userData'), 'guest-id.txt');

/**
 * 게스트 UUID를 반환한다.
 * 파일이 없으면 새로 생성·저장한다.
 * 앱 재설치 전까지 동일한 UUID가 유지되어 로컬 데이터와 연결된다.
 */
export function getOrCreateGuestId(): string {
  try {
    if (fs.existsSync(GUEST_ID_FILE)) {
      const existing = fs.readFileSync(GUEST_ID_FILE, 'utf8').trim();
      if (existing) return existing;
    }
  } catch {
    /* 읽기 실패 시 새로 생성 */
  }

  const id = randomUUID();
  try {
    fs.writeFileSync(GUEST_ID_FILE, id, 'utf8');
  } catch {
    /* 쓰기 실패 시 메모리에만 유지 (앱 재시작 시 새로운 UUID) */
  }
  return id;
}
