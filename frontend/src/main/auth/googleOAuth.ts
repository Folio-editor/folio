import { app, safeStorage, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { generatePkce, generateState } from './pkce';
import { getOrCreateDeviceId } from './deviceId';
import { startOAuthServer } from './oauthServer';
import { saveRefreshToken, getRefreshToken, clearRefreshToken } from './tokenStore';
import { saveLastWriterId, getLastWriterId } from './lastWriterStore';
import {
  createTokenRefreshScheduler,
  parseJwtExp,
  type RefreshOutcome,
} from './tokenRefreshScheduler';
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

// Lazy(401 retry) 경로와 proactive 타이머가 동시 발동 시 실제 /refresh는 1회로 직렬화
let refreshingPromise: Promise<RefreshOutcome> | null = null;

/** 만료 임박(30초 이내) 시 선제 refresh를 시도하는 기준값 */
const LAZY_REFRESH_BUFFER_MS = 30 * 1000;

/**
 * 현재 Access Token을 반환한다.
 * 만료 임박 시 선제적으로 refresh를 시도하여 좀비 세션(메모리에 만료 AT 잔류)을 방지한다.
 * - 만료 임박 + refresh 성공: 새 토큰 반환
 * - 만료 임박 + refresh 실패(네트워크): 기존 만료 토큰 반환 (호출자가 한 번은 시도하게)
 * - 만료 임박 + refresh 실패(RT 거부): null 반환 (clearAllTokens가 이미 호출됨)
 */
export async function getAccessToken(): Promise<string | null> {
  if (!currentAccessToken) return null;
  const exp = parseJwtExp(currentAccessToken);
  if (exp !== null && exp * 1000 - Date.now() < LAZY_REFRESH_BUFFER_MS) {
    const outcome = await performRefresh();
    if (outcome.kind === 'ok') return outcome.accessToken;
    if (outcome.kind === 'unauthorized') return null;
    // network — 만료된 토큰이라도 반환 (호출자가 401 받으면 tryRestore로 다시 시도)
    return currentAccessToken;
  }
  return currentAccessToken;
}

export function getCurrentWriter(): Writer | null {
  return currentWriter;
}

/** Main 프로세스 외부(index.ts)에서 session-expired 이벤트 구독용으로 노출. */
export const tokenRefreshScheduler = createTokenRefreshScheduler(() =>
  performRefresh(),
);

/**
 * 마지막으로 로그인한 사용자 writerId. 로그아웃 후에도 로컬 데이터를
 * 계속 표시하기 위한 참조값. 앱 재시작 시 영속 파일에서 복원된다.
 */
export function getLastKnownWriterId(): string | null {
  return getLastWriterId();
}

/**
 * sync 의사결정이 확정된 사용자의 writerId를 영속 저장한다.
 * renderer에서 resolveSyncDecision 성공 후 호출.
 */
export function commitLastKnownWriterId(writerId: string): void {
  saveLastWriterId(writerId);
}

interface LoginWithGoogleOptions {
  onCodeReceived?: () => void;
}

export async function loginWithGoogle(
  options: LoginWithGoogleOptions = {},
): Promise<LoginResult> {
  console.log('[oauth] loginWithGoogle 시작');
  console.log('[oauth] API URL:', apiUrl());
  console.log('[oauth] Client ID:', googleClientId());
  const deviceId = getOrCreateDeviceId();
  const { codeVerifier, codeChallenge } = generatePkce();
  const state = generateState();

  const server = await startOAuthServer();
  console.log('[oauth] 로컬 서버 시작:', server.redirectUri);

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
    console.log('[oauth] 브라우저 열림, code 대기 중...');

    const code = await server.waitForCode(state);
    options.onCodeReceived?.();
    console.log('[oauth] code 수신 완료, 백엔드 전송 중...');
    console.log('[oauth] fetch URL:', `${apiUrl()}/auth/login/google`);

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

    console.log('[oauth] 백엔드 응답 status:', response.status);
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error('[oauth] 로그인 실패:', response.status, text);
      throw new Error(`login failed: ${response.status} ${text}`);
    }

    const body = (await response.json()) as {
      accessToken: string;
      refreshToken: string;
      writer: Writer;
      isNewUser: boolean;
    };
    console.log('[oauth] 로그인 성공, writer:', body.writer?.id, 'isNewUser:', body.isNewUser);

    saveRefreshToken(body.refreshToken);
    saveLastAccessToken(body.accessToken);
    // 주의: lastWriterId는 여기서 저장하지 않는다.
    // 사용자가 SyncDecisionDialog에서 "취소"할 수 있는데, 그 경우 로그인 전
    // 게스트 상태로 되돌려야 한다. 커밋은 resolveSyncDecision 확정 후로 지연.
    currentAccessToken = body.accessToken;
    currentWriter = body.writer;

    tokenRefreshScheduler.start(body.accessToken);

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

  const outcome = await performRefresh();
  if (outcome.kind !== 'ok') {
    return null;
  }

  try {
    const meResponse = await fetch(`${apiUrl()}/auth/me`, {
      headers: { Authorization: `Bearer ${outcome.accessToken}` },
    });
    if (!meResponse.ok) {
      // HTTP 에러 (4xx/5xx) — 서버가 명시적으로 인증/권한 거부 → 토큰 삭제
      clearAllTokens();
      tokenRefreshScheduler.stop();
      return null;
    }
    const writer = (await meResponse.json()) as Writer;
    currentWriter = writer;
    saveLastWriterId(writer.id);
    // 자동 복원은 이미 결정 끝난 기존 사용자이므로 isNewUser=false
    return { accessToken: outcome.accessToken, writer, isNewUser: false };
  } catch {
    // 네트워크 오류 (오프라인 등) — 토큰 유지, 다음 기회에 재시도 가능하게 둔다.
    // performRefresh는 이미 성공했으므로 AT/RT는 유효. 이 경로에서 토큰을 지우면
    // 일시적 네트워크 끊김에도 세션이 완전 소실되어 오프라인 퍼스트 원칙에 위배.
    console.warn('[auth] /auth/me 네트워크 오류 — 토큰 유지, 재시도 대상');
    return null;
  }
}

/**
 * 백엔드 /auth/refresh 호출로 Access Token을 새로 발급받는다.
 * - 성공 시 새 AT/RT를 저장하고 scheduler를 재시작(재귀 리스케줄)
 * - 401/403 은 RT 거부 → {@link RefreshOutcome.unauthorized}
 * - 네트워크/5xx는 {@link RefreshOutcome.network}로 반환하여 호출자 재시도 유도
 *
 * Mutex: 진행 중인 refresh가 있으면 동일 Promise를 반환해 /refresh 중복 호출을 막는다.
 */
export async function performRefresh(): Promise<RefreshOutcome> {
  if (refreshingPromise) return refreshingPromise;

  refreshingPromise = (async () => {
    const refresh = getRefreshToken();
    const lastAccess = getLastAccessToken();
    if (!refresh || !lastAccess) {
      return { kind: 'unauthorized' } as const;
    }
    const deviceId = getOrCreateDeviceId();

    let response: Response;
    try {
      response = await fetch(`${apiUrl()}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${lastAccess}`,
        },
        body: JSON.stringify({ refreshToken: refresh, deviceId }),
      });
    } catch {
      // 네트워크 오류 (오프라인 등) — 세션 유지, 호출자가 재시도
      return { kind: 'network' } as const;
    }

    if (response.status === 401 || response.status === 403) {
      clearAllTokens();
      return { kind: 'unauthorized' } as const;
    }
    if (!response.ok) {
      // 5xx / 기타 — 세션 유지, 재시도 대상
      return { kind: 'network' } as const;
    }

    try {
      const { accessToken, refreshToken: newRefresh } =
        (await response.json()) as { accessToken: string; refreshToken: string };
      saveRefreshToken(newRefresh);
      saveLastAccessToken(accessToken);
      currentAccessToken = accessToken;
      tokenRefreshScheduler.start(accessToken);
      return { kind: 'ok', accessToken } as const;
    } catch {
      return { kind: 'network' } as const;
    }
  })();

  try {
    return await refreshingPromise;
  } finally {
    refreshingPromise = null;
  }
}

export async function logout(): Promise<void> {
  const deviceId = getOrCreateDeviceId();
  tokenRefreshScheduler.stop();
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
  if (!safeStorage.isEncryptionAvailable()) {
    // 무음 return 금지 — 저장 실패 시 앱 재시작 시 자동 복원이 영구 실패하므로
    // 로그인/refresh 경로에서 명확한 에러로 노출해 사용자가 원인을 알 수 있게 한다.
    throw new Error('safeStorage is not available on this system');
  }
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
