// ============================================================
// 랜딩 측 인증 상태 hint
// ============================================================
// 에디터의 web folioApi와 동일한 localStorage 키를 공유한다 (같은 origin).
// 클라이언트 hint이므로 RT 만료 등 정확한 검증은 에디터의 tryRestore에 위임.
// 랜딩에서는 UI 분기(로그인 vs 프로필) 용도로만 사용.
// ============================================================
import { useEffect, useState } from 'react';
const RT_KEY = 'folio:web:rt';
const WRITER_KEY = 'folio:web:writer';
const DEVICE_ID_KEY = 'folio:web:device-id';
const LAST_WRITER_ID_KEY = 'folio:web:last-writer-id';
function readWriter() {
    try {
        const raw = localStorage.getItem(WRITER_KEY);
        return raw ? JSON.parse(raw) : null;
    }
    catch {
        return null;
    }
}
export function readLandingAuth() {
    try {
        const rt = localStorage.getItem(RT_KEY);
        const writer = readWriter();
        return {
            writer: rt && writer ? writer : null,
            isAuthenticated: !!(rt && writer),
        };
    }
    catch {
        return { writer: null, isAuthenticated: false };
    }
}
/** 명시적 로그아웃 — 에디터/다른 탭과도 동기화. last-writer-id는 함께 정리. */
export function clearLandingAuth() {
    try {
        localStorage.removeItem(RT_KEY);
        localStorage.removeItem(WRITER_KEY);
        localStorage.removeItem(DEVICE_ID_KEY);
        localStorage.removeItem(LAST_WRITER_ID_KEY);
    }
    catch {
        /* ignore */
    }
    try {
        new BroadcastChannel('folio-auth').postMessage({ type: 'logout' });
    }
    catch {
        /* BroadcastChannel 미지원 환경 — 무시 */
    }
}
/**
 * React hook — 인증 상태 + storage event/BroadcastChannel 구독.
 * 다른 탭에서 로그인/아웃 시 즉시 갱신.
 */
export function useLandingAuth() {
    const [auth, setAuth] = useState(() => readLandingAuth());
    useEffect(() => {
        const refresh = () => setAuth(readLandingAuth());
        // 다른 탭에서 localStorage 변경 시
        const onStorage = (e) => {
            if (e.key === RT_KEY || e.key === WRITER_KEY || e.key === null) {
                refresh();
            }
        };
        window.addEventListener('storage', onStorage);
        // 같은 탭 내 BroadcastChannel logout 알림
        let bc = null;
        try {
            bc = new BroadcastChannel('folio-auth');
            bc.onmessage = (e) => {
                if (e.data?.type === 'logout')
                    refresh();
            };
        }
        catch {
            /* 무시 */
        }
        return () => {
            window.removeEventListener('storage', onStorage);
            bc?.close();
        };
    }, []);
    return auth;
}
