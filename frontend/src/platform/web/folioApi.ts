// ============================================================
// Web FolioApi 구현 — 브라우저 환경용
// ============================================================
// Electron의 IPC 기반 FolioApi와 동일한 인터페이스를 충족하지만
// 토큰 저장은 메모리 + httpOnly 쿠키, OAuth 진입은 백엔드 redirect 흐름이다.
//
// 게스트 모드는 웹에서 비활성 — getGuestId 호출은 사용처에서 가드되어야 한다.
// ============================================================

import type { FolioApi, LoginResult, Writer } from '../../shared/types/auth';

/** apiClient와 동일한 URL 정규화 — VITE_API_URL이 trailing slash 포함이면 제거. */
function apiUrl(): string {
  const url =
    (import.meta.env.VITE_API_URL as string | undefined) ??
    'http://127.0.0.1:8080/api/v1';
  return url.replace(/\/$/, '');
}

/** 메모리에만 보존하는 Access Token. 새로고침 시 휘발 → tryRestore로 즉시 회복. */
let accessToken: string | null = null;

/** 세션 만료 이벤트 fan-out (apiClient의 refresh 실패 → 가입 만료 알림). */
const sessionExpiredTarget = new EventTarget();

/** 외부에서 세션 만료를 알릴 수 있도록 노출 — apiClient가 refresh 실패 시 호출. */
export function emitWebSessionExpired() {
  sessionExpiredTarget.dispatchEvent(new Event('expired'));
}

/** apiClient가 refresh 후 새 AT를 메모리에 반영하기 위해 사용. */
export function setWebAccessToken(token: string | null) {
  accessToken = token;
}

/** 디버깅/통합용 — 현재 메모리 AT 조회. */
export function getWebAccessToken(): string | null {
  return accessToken;
}

const LAST_WRITER_ID_KEY = 'folio:web:last-writer-id';

export function createWebFolioApi(): FolioApi {
  return {
    platform: 'web',
    auth: {
      loginWithGoogle: async () => {
        // 백엔드 OAuth start로 full-page navigation. 응답 후 에디터로 redirect되어 돌아온다.
        const returnTo = encodeURIComponent(
          window.location.pathname + window.location.search,
        );
        window.location.href = `${apiUrl()}/auth/google/web/start?returnTo=${returnTo}`;
        // 페이지가 떠나므로 이 Promise는 사실상 resolve되지 않는다.
        return new Promise<LoginResult>(() => {});
      },

      tryRestore: async () => {
        try {
          const refreshRes = await fetch(`${apiUrl()}/auth/refresh-cookie`, {
            method: 'POST',
            credentials: 'include',
          });
          if (!refreshRes.ok) return null;
          const refreshBody = (await refreshRes.json()) as { accessToken: string };
          accessToken = refreshBody.accessToken;

          // 사용자 정보 조회 — Bearer 헤더로 직접
          const meRes = await fetch(`${apiUrl()}/auth/me`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            credentials: 'include',
          });
          if (!meRes.ok) {
            accessToken = null;
            return null;
          }
          const writer = (await meRes.json()) as Writer;
          return { accessToken, writer, isNewUser: false };
        } catch {
          return null;
        }
      },

      getAccessToken: async () => accessToken,

      logout: async () => {
        try {
          await fetch(`${apiUrl()}/auth/web/logout`, {
            method: 'POST',
            credentials: 'include',
          });
        } catch {
          // 네트워크 오류여도 로컬 메모리는 비운다 — 다음 요청에서 401 처리됨
        }
        accessToken = null;
        // 다른 탭에도 알림
        try {
          new BroadcastChannel('folio-auth').postMessage({ type: 'logout' });
        } catch {
          /* BroadcastChannel 미지원 환경 — 무시 */
        }
      },

      getGuestId: async () => {
        // 웹은 게스트 모드 비활성. 호출처에서 platform 체크로 가드되어야 함.
        throw new Error('guest mode is not supported on web');
      },

      getLastKnownWriterId: async () => localStorage.getItem(LAST_WRITER_ID_KEY),

      commitLastKnownWriterId: async (writerId: string) => {
        localStorage.setItem(LAST_WRITER_ID_KEY, writerId);
      },

      onSessionExpired: (callback) => {
        const handler = () => callback();
        sessionExpiredTarget.addEventListener('expired', handler);

        // 다른 탭의 로그아웃도 세션 만료로 취급
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
    spellcheck: {
      // Electron 전용 기능 — 웹에서는 호출 자체가 platform 체크로 막혀있지만 안전하게 no-op.
      syncDictionaryWords: async () => {},
    },
  };
}
