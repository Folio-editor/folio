// ============================================================
// 랜딩 측 인증 상태 hint
// ============================================================
// 에디터의 web folioApi와 동일한 localStorage 키를 공유한다 (같은 origin).
// 클라이언트 hint이므로 RT 만료 등 정확한 검증은 에디터의 tryRestore에 위임.
// 랜딩에서는 UI 분기(로그인 vs 프로필) 용도로만 사용.
//
// OAuth callback (returnTo=/?fromLanding=1) 직후 URL 에 ?auth_code=xxx 가 박혀
// 도착하면 {@link exchangeAuthCodeIfPresent} 가 1회 교환해 localStorage 를 채워야
// useLandingAuth 가 인증된 상태로 인식한다. 이 함수는 App 부팅 시 한 번 호출.
// ============================================================

import { useEffect, useState } from 'react';
import { apiBase } from './loginUrl';

export type Role = 'USER' | 'PREMIUM' | 'ADMIN';

export interface Writer {
  id: string;
  email: string;
  nickname: string | null;
  profileImageUrl: string | null;
  role: Role;
}

const RT_KEY = 'folio:web:rt';
const WRITER_KEY = 'folio:web:writer';
const DEVICE_ID_KEY = 'folio:web:device-id';
const LAST_WRITER_ID_KEY = 'folio:web:last-writer-id';

export interface LandingAuth {
  writer: Writer | null;
  isAuthenticated: boolean;
}

function readWriter(): Writer | null {
  try {
    const raw = localStorage.getItem(WRITER_KEY);
    return raw ? (JSON.parse(raw) as Writer) : null;
  } catch {
    return null;
  }
}

export function readLandingAuth(): LandingAuth {
  try {
    const rt = localStorage.getItem(RT_KEY);
    const writer = readWriter();
    return {
      writer: rt && writer ? writer : null,
      isAuthenticated: !!(rt && writer),
    };
  } catch {
    return { writer: null, isAuthenticated: false };
  }
}

/** 명시적 로그아웃 — 에디터/다른 탭과도 동기화. last-writer-id는 함께 정리. */
export function clearLandingAuth(): void {
  try {
    localStorage.removeItem(RT_KEY);
    localStorage.removeItem(WRITER_KEY);
    localStorage.removeItem(DEVICE_ID_KEY);
    localStorage.removeItem(LAST_WRITER_ID_KEY);
  } catch {
    /* ignore */
  }
  try {
    new BroadcastChannel('folio-auth').postMessage({ type: 'logout' });
  } catch {
    /* BroadcastChannel 미지원 환경 — 무시 */
  }
}

/**
 * OAuth callback redirect 직후 URL 의 {@code ?auth_code=xxx} 를 1회 백엔드에서
 * AT/RT/writer/deviceId 로 교환하여 localStorage 에 채운다.
 *
 * <p>에디터({@code frontend/src/platform/web/folioApi.ts}) 의
 * {@code exchangeAuthCodeIfPresent} 와 동일한 흐름이지만, 랜딩은 API 호출을 직접
 * 하지 않으므로 accessToken 메모리 저장은 생략한다. 다음 페이지(에디터 등)로
 * 이동 시 동일 localStorage 의 RT 로 {@code /auth/web/refresh} 가 새 AT 를 발급.
 *
 * <p>새로고침 시 재교환되지 않도록 성공/실패와 무관하게 URL 에서 즉시 제거.
 *
 * @returns 교환 성공 시 true (이때 localStorage 가 채워지고 useLandingAuth 가 인증 상태로 인식)
 */
export async function exchangeAuthCodeIfPresent(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('auth_code');
  if (!code) return false;

  // URL 에서 auth_code + fromLanding 즉시 제거 — 새로고침 시 재교환 방지
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
      `${apiBase()}/auth/web/exchange?code=${encodeURIComponent(code)}`,
      { method: 'POST' },
    );
    if (!res.ok) {
      console.warn('[landing/auth] auth_code 교환 실패:', res.status);
      return false;
    }
    const payload = (await res.json()) as {
      accessToken: string;
      refreshToken: string;
      deviceId: string;
      writer: Writer;
    };
    localStorage.setItem(RT_KEY, payload.refreshToken);
    localStorage.setItem(DEVICE_ID_KEY, payload.deviceId);
    localStorage.setItem(WRITER_KEY, JSON.stringify(payload.writer));
    localStorage.setItem(LAST_WRITER_ID_KEY, payload.writer.id);
    return true;
  } catch (e) {
    console.warn('[landing/auth] auth_code 교환 에러:', e);
    return false;
  }
}

/**
 * React hook — 인증 상태 + storage event/BroadcastChannel 구독.
 * 다른 탭에서 로그인/아웃 시 즉시 갱신.
 */
export function useLandingAuth(): LandingAuth {
  const [auth, setAuth] = useState<LandingAuth>(() => readLandingAuth());

  useEffect(() => {
    const refresh = () => setAuth(readLandingAuth());

    // 다른 탭에서 localStorage 변경 시
    const onStorage = (e: StorageEvent) => {
      if (e.key === RT_KEY || e.key === WRITER_KEY || e.key === null) {
        refresh();
      }
    };
    window.addEventListener('storage', onStorage);

    // 같은 탭 내 BroadcastChannel logout 알림
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('folio-auth');
      bc.onmessage = (e) => {
        if (e.data?.type === 'logout') refresh();
      };
    } catch {
      /* 무시 */
    }

    return () => {
      window.removeEventListener('storage', onStorage);
      bc?.close();
    };
  }, []);

  return auth;
}
