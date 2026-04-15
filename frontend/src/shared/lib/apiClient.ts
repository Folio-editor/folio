/**
 * 백엔드 API 호출 래퍼.
 * - Main 프로세스의 Access Token을 IPC로 조회하여 Authorization 헤더 자동 삽입
 * - 401 응답 시 tryRestore 통해 자동 refresh 후 1회 재시도
 * - refresh 실패 시 로그아웃 상태로 전환
 */

function apiUrl(): string {
  const url = import.meta.env.VITE_API_URL ?? 'http://localhost:8080/api/v1';
  return url.replace(/\/$/, '');
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  const token = await window.storyzip.auth.getAccessToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${apiUrl()}${path}`, { ...init, headers });

  if (response.status === 401 && retry) {
    const restored = await window.storyzip.auth.tryRestore();
    if (restored) {
      return request<T>(path, init, false);
    }
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new ApiError(response.status, text || response.statusText);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
