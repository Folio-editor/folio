// ============================================================
// 백엔드 OAuth start URL 빌더
// ============================================================
// 랜딩 → 백엔드 → 에디터 3-도메인 OAuth 흐름의 진입점.
// 클릭 시 window.location.href로 직접 이동(SPA navigation 아님).
// ============================================================
/**
 * 백엔드 API base URL.
 * Doppler 변수 VITE_API_URL은 trailing slash 포함 가능 → 정규화.
 * 기본값: dev 백엔드 (localhost:8080).
 */
export function apiBase() {
    const url = import.meta.env.VITE_API_URL ??
        'http://localhost:8080/api/v1';
    return url.replace(/\/$/, '');
}
/**
 * 에디터 도착지 URL — OAuth callback 후 백엔드가 redirect할 대상.
 * 운영에선 https://app.folio.com, dev에선 http://localhost:5173.
 */
function editorBase() {
    const url = import.meta.env.VITE_EDITOR_URL ??
        'http://localhost:5173';
    return url.replace(/\/$/, '');
}
/**
 * Google OAuth 시작 URL을 빌드한다.
 * @param returnPath 에디터 안에서 도착 후 갈 path (기본 "/")
 */
export function buildLoginUrl(returnPath = '/') {
    // 백엔드는 returnTo가 path만 받는다 (open-redirect 방지).
    // 에디터 base는 백엔드 application.yml의 app.web.editor-url과 일치해야 한다.
    const safe = returnPath.startsWith('/') ? returnPath : '/';
    return `${apiBase()}/auth/google/web/start?returnTo=${encodeURIComponent(safe)}`;
}
/** 에디터 root URL — Download/시작 버튼이 직접 향할 수 있는 풀 URL. */
export function editorUrl(returnPath = '/') {
    const safe = returnPath.startsWith('/') ? returnPath : '/';
    return `${editorBase()}${safe}`;
}
