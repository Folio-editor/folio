import { app } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const FILE_NAME = 'device-id.txt';

/**
 * 기기 고유 ID.
 * userData 디렉토리에 텍스트 파일로 영속 저장. 앱 재설치 전까지 유지.
 * Refresh Token의 Redis 키 일부로 사용되어 다중 기기 로그인을 가능하게 한다.
 */
export function getOrCreateDeviceId(): string {
  const filePath = path.join(app.getPath('userData'), FILE_NAME);
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, 'utf-8').trim();
    if (existing) return existing;
  }
  const newId = crypto.randomUUID();
  fs.writeFileSync(filePath, newId, 'utf-8');
  return newId;
}
