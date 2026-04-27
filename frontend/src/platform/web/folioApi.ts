// ============================================================
// Web FolioApi 구현 — Electron 패턴 그대로 (auth_code + Bearer 헤더)
// ============================================================
// 설계 원칙:
// - 쿠키 의존 0 (cross-port localhost 환경의 cookie 정책 회피)
// - Electron의 PKCE + safeStorage + Bearer 패턴을 web에 동형 매핑
//   - safeStorage → localStorage (web 한계 — XSS 위험은 prod에서 도메인 분리로 완화)
//   - PKCE 결과 token → backend가 발급한 short-lived auth_code 교환
// - 모든 API 호출은 Authorization: Bearer (apiClient/connector 그대로 동작)
// ============================================================

import type { FolioApi, LoginResult, Writer } from '../../shared/types/auth';

function apiUrl(): string {
  const url =
    (import.meta.env.VITE_API_URL as string | undefined) ??
    'http://127.0.0.1:8080/api/v1';
  return url.replace(/\/$/, '');
}

const RT_KEY = 'folio:web:rt';
const DEVICE_ID_KEY = 'folio:web:device-id';
const WRITER_KEY = 'folio:web:writer';
const LAST_WRITER_ID_KEY = 'folio:web:last-writer-id';

let accessToken: string | null = null;
const sessionExpiredTarget = new EventTarget();

export function setWebAccessToken(token: string | null) {
  accessToken = token;
}

export function getWebAccessToken(): string | null {
  return accessToken;
}

/**
 * 백엔드 callback이 redirect URL에 박은 ?auth_code=xxx를 1회 교환하여
 * AT/RT/writer/deviceId를 받아 저장한다.
 *
 * @returns 로그인 성공 시 Writer, 그 외 (auth_code 없음/만료/네트워크 실패) null
 */
function landingUrl(): string {
  const url = (import.meta.env.VITE_LANDING_URL as string | undefined) ?? '';
  return url.replace(/\/$/, '');
}

/** 교환 직후 fromLanding=1 플래그가 있었다면 랜딩으로 다시 bounce. */
function bounceToLandingIfRequested(fromLanding: boolean): void {
  if (!fromLanding) return;
  const target = landingUrl() || window.location.origin + '/';
  // 무한 redirect 방지 flag 정리 (랜딩에서 명시적 로그인 시도 후 도착했으므로)
  try {
    sessionStorage.removeItem('folio:web:noredirect');
  } catch {
    /* ignore */
  }
  window.location.replace(target);
}

export async function exchangeAuthCodeIfPresent(): Promise<LoginResult | null> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('auth_code');
  if (!code) return null;

  // URL 정리 전에 fromLanding 플래그 캡처 — 교환 후 랜딩으로 bounce 여부 결정
  const fromLanding = params.get('fromLanding') === '1';

  // URL에서 auth_code + fromLanding 즉시 제거 — 새로고침 시 재교환/재bounce 방지
  params.delete('auth_code');
  params.delete('fromLanding');
  const newSearch = params.toString();
  const newUrl =
    window.location.pathname +
    (newSearch ? `?${newSearch}` : '') +
    window.location.hash;
  window.history.replaceState({}, '', newUrl);

  try {
    const res = await fetch(
      `${apiUrl()}/auth/web/exchange?code=${encodeURIComponent(code)}`,
      { method: 'POST' },
    );
    if (!res.ok) {
      console.warn('[web/folioApi] auth_code 교환 실패:', res.status);
      // 실패해도 랜딩으로 돌려보내 사용자가 다시 시도할 수 있게 함
      bounceToLandingIfRequested(fromLanding);
      return null;
    }
    const payload = (await res.json()) as {
      accessToken: string;
      refreshToken: string;
      deviceId: string;
      writer: Writer;
      isNewUser: boolean;
    };

    accessToken = payload.accessToken;
    localStorage.setItem(RT_KEY, payload.refreshToken);
    localStorage.setItem(DEVICE_ID_KEY, payload.deviceId);
    localStorage.setItem(WRITER_KEY, JSON.stringify(payload.writer));
    localStorage.setItem(LAST_WRITER_ID_KEY, payload.writer.id);

    // 교환 성공 — 랜딩으로 돌아가야 한다면 즉시 bounce
    bounceToLandingIfRequested(fromLanding);

    return {
      accessToken: payload.accessToken,
      writer: payload.writer,
      isNewUser: payload.isNewUser,
    };
  } catch (e) {
    console.warn('[web/folioApi] auth_code 교환 에러:', e);
    bounceToLandingIfRequested(fromLanding);
    return null;
  }
}

function readWriterFromStorage(): Writer | null {
  try {
    const raw = localStorage.getItem(WRITER_KEY);
    return raw ? (JSON.parse(raw) as Writer) : null;
  } catch {
    return null;
  }
}

function clearAuthStorage() {
  accessToken = null;
  localStorage.removeItem(RT_KEY);
  localStorage.removeItem(DEVICE_ID_KEY);
  localStorage.removeItem(WRITER_KEY);
  // LAST_WRITER_ID_KEY는 보존 (Electron의 lastKnownWriterId 동등 — 로그아웃 후에도 로컬 데이터 표시용)
}

export function createWebFolioApi(): FolioApi {
  return {
    platform: 'web',
    auth: {
      loginWithGoogle: async () => {
        // 백엔드 OAuth start로 full-page navigation
        const returnTo = encodeURIComponent(
          window.location.pathname + window.location.search,
        );
        window.location.href = `${apiUrl()}/auth/google/web/start?returnTo=${returnTo}`;
        return new Promise<LoginResult>(() => {});
      },

      tryRestore: async () => {
        // 1. URL에 auth_code가 있으면 1회 교환 (callback redirect 직후)
        const fresh = await exchangeAuthCodeIfPresent();
        if (fresh) return fresh;

        // 2. localStorage에 RT/deviceId가 있으면 /auth/web/refresh로 새 AT 발급
        const rt = localStorage.getItem(RT_KEY);
        const did = localStorage.getItem(DEVICE_ID_KEY);
        if (!rt || !did) return null;

        try {
          const res = await fetch(`${apiUrl()}/auth/web/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: rt }),
          });
          if (!res.ok) {
            // RT 무효 → 로그아웃 상태로 정리
            clearAuthStorage();
            return null;
          }
          const body = (await res.json()) as {
            accessToken: string;
            refreshToken: string;
          };
          accessToken = body.accessToken;
          localStorage.setItem(RT_KEY, body.refreshToken); // RT rotation

          const writer = readWriterFromStorage();
          if (!writer) {
            // writer 정보 손실 — 로그아웃 처리 (어떤 사용자인지 알 수 없음)
            clearAuthStorage();
            return null;
          }
          return { accessToken: body.accessToken, writer, isNewUser: false };
        } catch (e) {
          console.warn('[web/folioApi] tryRestore 네트워크 에러:', e);
          return null;
        }
      },

      getAccessToken: async () => accessToken,

      logout: async () => {
        const rt = localStorage.getItem(RT_KEY);
        try {
          if (rt) {
            await fetch(`${apiUrl()}/auth/web/logout`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refreshToken: rt }),
            });
          }
        } catch {
          // 네트워크 실패해도 로컬 정리는 진행
        }
        clearAuthStorage();
        try {
          new BroadcastChannel('folio-auth').postMessage({ type: 'logout' });
        } catch {
          /* BroadcastChannel 미지원 — 무시 */
        }
      },

      getGuestId: async () => {
        throw new Error('guest mode is not supported on web');
      },

      getLastKnownWriterId: async () => localStorage.getItem(LAST_WRITER_ID_KEY),

      commitLastKnownWriterId: async (writerId: string) => {
        localStorage.setItem(LAST_WRITER_ID_KEY, writerId);
      },

      onSessionExpired: (callback) => {
        const handler = () => callback();
        sessionExpiredTarget.addEventListener('expired', handler);

        let bc: BroadcastChannel | null = null;
        try {
          bc = new BroadcastChannel('folio-auth');
          bc.onmessage = (e) => {
            if (e.data?.type === 'logout') callback();
          };
        } catch {
          /* BroadcastChannel 미지원 — 무시 */
        }

        return () => {
          sessionExpiredTarget.removeEventListener('expired', handler);
          bc?.close();
        };
      },
    },
    window: {
      // 웹은 OS 창을 제어할 수 없음 — no-op / safe defaults
      minimize: async () => {},
      toggleMaximize: async () => {},
      close: async () => {},
      isMaximized: async () => false,
      onMaximizeChanged: () => () => {},
      platform: 'web',
    },
    spellcheck: {
      // 웹은 OS spellchecker 사전 동기화 불가 — no-op (브라우저 native spellcheck로 fallback)
      syncWords: async () => {},
    },
    payment: {
      // 웹은 결제 창을 main process로 띄울 수 없음 — 호출 시 명시적 reject
      openOneTime: async () => {
        throw new Error('웹 환경에서는 결제 기능을 사용할 수 없습니다.');
      },
      openBillingAuth: async () => {
        throw new Error('웹 환경에서는 결제 기능을 사용할 수 없습니다.');
      },
    },
    updater: {
      // 웹은 자동 업데이트 대상이 아님 — 브라우저가 알아서 새 버전을 로드.
      // UI는 platform === 'web' 가드로 섹션 자체를 숨기지만, API 호출 시 안전하게 unsupported 반환.
      getCurrentVersion: async () =>
        (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '0.0.0',
      check: async () => ({
        phase: 'unsupported',
        error: '웹에서는 앱 업데이트가 자동 처리됩니다',
      }),
      download: async () => ({
        phase: 'unsupported',
        error: '웹에서는 앱 업데이트가 자동 처리됩니다',
      }),
      installAndRestart: async () => {},
      onStateChange: () => () => {},
    },
  };
}
