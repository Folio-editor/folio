import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const FILE_NAME = 'refresh.bin';

function filePath() {
  return path.join(app.getPath('userData'), FILE_NAME);
}

/**
 * Refresh Token을 OS 키체인 기반으로 암호화하여 저장.
 * - macOS: Keychain
 * - Windows: DPAPI
 * - Linux: libsecret/kwallet
 *
 * 일부 Linux 환경에서는 평문 fallback이 발생할 수 있다.
 * {@link safeStorage#isEncryptionAvailable}로 확인 가능.
 */
export function saveRefreshToken(token: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('safeStorage is not available on this system');
  }
  const encrypted = safeStorage.encryptString(token);
  fs.writeFileSync(filePath(), encrypted);
}

export function getRefreshToken(): string | null {
  const p = filePath();
  if (!fs.existsSync(p)) return null;
  try {
    const buffer = fs.readFileSync(p);
    return safeStorage.decryptString(buffer);
  } catch {
    // 복호화 실패 — 파일 손상 또는 OS 키체인 변경. 파일 정리 후 null.
    try {
      fs.unlinkSync(p);
    } catch {
      /* ignore */
    }
    return null;
  }
}

export function clearRefreshToken(): void {
  const p = filePath();
  if (fs.existsSync(p)) fs.unlinkSync(p);
}
