import { app, safeStorage, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { generatePkce, generateState } from './pkce';
import { getOrCreateDeviceId } from './deviceId';
import { startOAuthServer } from './oauthServer';
import { saveRefreshToken, getRefreshToken, clearRefreshToken } from './tokenStore';
import type { LoginResult, Writer } from '../../shared/types/auth';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPE = 'openid email profile';

function apiUrl(): string {
  const url = process.env.VITE_API_URL ?? 'http://127.0.0.1:8080/api/v1';
  return url.replace(/\/$/, '');
}

function googleClientId(): string {
  const id = process.env.VITE_GOOGLE_DESKTOP_CLIENT_ID;
  if (!id) {
    throw new Error('VITE_GOOGLE_DESKTOP_CLIENT_ID is not set');
  }
  return id;
}

// 메인 프로세스 메모리에만 보관
let currentAccessToken: string | null = null;
let currentWriter: Writer | null = null;

export function getAccessToken(): string | null {
  return currentAccessToken;
}

export function getCurrentWriter(): Writer | null {
  return currentWriter;
}

export async function loginWithGoogle(): Promise<LoginResult> {
  const deviceId = getOrCreateDeviceId();
  const { codeVerifier, codeChallenge } = generatePkce();
  const state = generateState();

  const server = await startOAuthServer();

  try {
    const authUrl = new URL(GOOGLE_AUTH_URL);
    authUrl.searchParams.set('client_id', googleClientId());
    authUrl.searchParams.set('redirect_uri', server.redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', SCOPE);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'select_account');

    await shell.openExternal(authUrl.toString());

    const code = await server.waitForCode(state);

    const response = await fetch(`${apiUrl()}/auth/login/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        codeVerifier,
        redirectUri: server.redirectUri,
        deviceId,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`login failed: ${response.status} ${text}`);
    }

    const body = (await response.json()) as {
      accessToken: string;
      refreshToken: string;
      writer: Writer;
      isNewUser: boolean;
    };

    saveRefreshToken(body.refreshToken);
    saveLastAccessToken(body.accessToken);
    currentAccessToken = body.accessToken;
    currentWriter = body.writer;

    return { accessToken: body.accessToken, writer: body.writer, isNewUser: body.isNewUser };
  } finally {
    server.close();
  }
}

/**
 * 앱 재시작 시 저장된 refreshToken으로 자동 재로그인 시도.
 */
export async function tryRestoreLogin(): Promise<LoginResult | null> {
  const refresh = getRefreshToken();
  const lastAccess = getLastAccessToken();
  if (!refresh || !lastAccess) {
    return null;
  }

  const deviceId = getOrCreateDeviceId();

  try {
    const refreshResponse = await fetch(`${apiUrl()}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${lastAccess}`,
      },
      body: JSON.stringify({ refreshToken: refresh, deviceId }),
    });

    if (!refreshResponse.ok) {
      clearAllTokens();
      return null;
    }

    const { accessToken, refreshToken: newRefresh } =
      (await refreshResponse.json()) as { accessToken: string; refreshToken: string };

    saveRefreshToken(newRefresh);
    saveLastAccessToken(accessToken);
    currentAccessToken = accessToken;

    const meResponse = await fetch(`${apiUrl()}/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!meResponse.ok) {
      clearAllTokens();
      return null;
    }
    const writer = (await meResponse.json()) as Writer;
    currentWriter = writer;

    // 자동 복원은 이미 결정 끝난 기존 사용자이므로 isNewUser=false
    return { accessToken, writer, isNewUser: false };
  } catch {
    clearAllTokens();
    return null;
  }
}

export async function logout(): Promise<void> {
  const deviceId = getOrCreateDeviceId();
  if (currentAccessToken) {
    try {
      await fetch(`${apiUrl()}/auth/logout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${currentAccessToken}`,
          'X-Device-Id': deviceId,
        },
      });
    } catch {
      // 네트워크 오류여도 로컬 정리는 계속
    }
  }
  clearAllTokens();
}

// ─── Last Access Token (자동 로그인용) ─────────────────────
// refresh 엔드포인트가 만료된 Access Token을 요구하므로 저장 필요.

function lastAccessPath() {
  return path.join(app.getPath('userData'), 'last-access.bin');
}

function saveLastAccessToken(token: string): void {
  if (!safeStorage.isEncryptionAvailable()) return;
  fs.writeFileSync(lastAccessPath(), safeStorage.encryptString(token));
}

function getLastAccessToken(): string | null {
  const p = lastAccessPath();
  if (!fs.existsSync(p)) return null;
  try {
    return safeStorage.decryptString(fs.readFileSync(p));
  } catch {
    try { fs.unlinkSync(p); } catch { /* ignore */ }
    return null;
  }
}

function clearLastAccessToken(): void {
  const p = lastAccessPath();
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

function clearAllTokens(): void {
  currentAccessToken = null;
  currentWriter = null;
  clearRefreshToken();
  clearLastAccessToken();
}
