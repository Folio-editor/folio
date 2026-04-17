import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 마지막으로 로그인한 사용자 writerId를 영속 저장한다.
 *
 * <p>로그아웃 후에도 로컬 데이터를 계속 조회/표시할 수 있도록 유지하는 참조값.
 * <p>민감 정보가 아니라 평문으로 저장한다(UUID).
 *
 * <p>지우는 시점은 현재 없음 — 다른 사용자가 같은 기기에서 로그인하면 덮어씀.
 * 기기 초기화가 필요하면 userData 전체 삭제로 처리.
 */

const FILE_NAME = 'last-writer-id.txt';

function filePath() {
  return path.join(app.getPath('userData'), FILE_NAME);
}

export function saveLastWriterId(writerId: string): void {
  fs.writeFileSync(filePath(), writerId, 'utf8');
}

export function getLastWriterId(): string | null {
  const p = filePath();
  if (!fs.existsSync(p)) return null;
  try {
    const v = fs.readFileSync(p, 'utf8').trim();
    return v || null;
  } catch {
    return null;
  }
}

export function clearLastWriterId(): void {
  const p = filePath();
  if (fs.existsSync(p)) fs.unlinkSync(p);
}
