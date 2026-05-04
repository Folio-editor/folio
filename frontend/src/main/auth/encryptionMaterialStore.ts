import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const FILE_NAME = 'encryption.bin';

/**
 * Plan C 결정 1 — Electron 데스크탑에서 KEK 도출 재료(pepper_user, salt, sub, version)를
 * OS 키체인(safeStorage)으로 암호화하여 userData에 저장한다.
 *
 * <ul>
 *   <li>macOS: Keychain</li>
 *   <li>Windows: DPAPI</li>
 *   <li>Linux: libsecret/kwallet (실패 시 평문 fallback 가능 — isEncryptionAvailable 검사 필수)</li>
 * </ul>
 *
 * <p>raw KEK는 디스크에 절대 두지 않는다. KEK 자체는 매 세션 메모리에서 재도출.
 */

export interface PersistedMaterial {
  sub: string;
  saltBase64: string;
  pepperUserBase64: string;
  pepperVersion: string;
}

function filePath(): string {
  return path.join(app.getPath('userData'), FILE_NAME);
}

export function saveMaterial(material: PersistedMaterial): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('safeStorage is not available on this system');
  }
  const json = JSON.stringify(material);
  const encrypted = safeStorage.encryptString(json);
  fs.writeFileSync(filePath(), encrypted);
}

export function loadMaterial(): PersistedMaterial | null {
  const p = filePath();
  if (!fs.existsSync(p)) return null;
  try {
    const buffer = fs.readFileSync(p);
    const json = safeStorage.decryptString(buffer);
    const parsed = JSON.parse(json) as PersistedMaterial;
    if (
      typeof parsed.sub !== 'string' ||
      typeof parsed.saltBase64 !== 'string' ||
      typeof parsed.pepperUserBase64 !== 'string' ||
      typeof parsed.pepperVersion !== 'string'
    ) {
      // 포맷 손상 — 폐기
      try {
        fs.unlinkSync(p);
      } catch {
        /* ignore */
      }
      return null;
    }
    return parsed;
  } catch {
    // 복호화 실패 (OS 키체인 변경/파일 손상) — 폐기 후 null
    try {
      fs.unlinkSync(p);
    } catch {
      /* ignore */
    }
    return null;
  }
}

export function clearMaterial(): void {
  const p = filePath();
  if (fs.existsSync(p)) fs.unlinkSync(p);
}
