/**
 * 백엔드 API 호출 래퍼.
 * - Access Token을 window.folio.auth.getAccessToken()으로 조회하여 Authorization 헤더 자동 삽입
 *   (Electron: IPC로 Main 프로세스의 토큰, Web: 메모리 보유 토큰)
 * - 401 응답 시 tryRestore 통해 자동 refresh 후 1회 재시도
 * - 동시 다발 401에도 refresh는 단일 in-flight Promise로 직렬화 (RT rotation race 방지)
 * - refresh 실패 시 로그아웃 상태로 전환
 * - 오프라인 시 fetch 시도 없이 즉시 에러 반환
 * - credentials: 'include' — 웹 RT httpOnly 쿠키 첨부 (Electron file://에선 영향 없음)
 */

import { useNetworkStore } from '../hooks/useNetworkStatus';
import type { LoginResult } from '../types/auth';

const OFFLINE_MESSAGE = '오프라인 상태입니다. 네트워크 연결을 확인하세요.';

/**
 * 진행 중인 tryRestore Promise 1개를 공유한다.
 * 동시에 발생한 다중 401 호출이 각자 refresh를 트리거하면
 * RT rotation 시 일부 요청이 stale RT로 거부될 수 있다 → 직렬화.
 */
let inflightRestore: Promise<LoginResult | null> | null = null;
function sharedTryRestore(): Promise<LoginResult | null> {
  if (!inflightRestore) {
    inflightRestore = window.folio.auth.tryRestore().finally(() => {
      inflightRestore = null;
    });
  }
  return inflightRestore;
}

function apiUrl(): string {
  // Windows Docker의 IPv6 localhost 이슈 회피를 위해 기본값을 127.0.0.1로 통일
  const url = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8080/api/v1';
  return url.replace(/\/$/, '');
}

export class ApiError extends Error {
  public code?: string;
  constructor(
    public status: number,
    message: string,
    code?: string,
  ) {
    super(message);
    this.code = code;
  }
}

/**
 * 서버 응답 본문이 `{"code":"...","message":"..."}` JSON이면 사람이 읽을 메시지만 추출.
 * 비-JSON이면 원문을, 빈 본문이면 fallback(statusText)을 그대로 쓴다.
 */
function parseErrorBody(text: string, statusText: string): { message: string; code?: string } {
  if (!text) return { message: statusText };
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') {
      const message = typeof parsed.message === 'string' ? parsed.message : statusText;
      const code = typeof parsed.code === 'string' ? parsed.code : undefined;
      return { message, code };
    }
  } catch {
    // 비-JSON 본문은 그대로 사용
  }
  return { message: text };
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  if (!useNetworkStore.getState().isOnline) {
    throw new ApiError(0, OFFLINE_MESSAGE);
  }

  const token = await window.folio.auth.getAccessToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${apiUrl()}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (response.status === 401 && retry) {
    const restored = await sharedTryRestore();
    if (restored) {
      // body를 새 객체로 재구성 — ReadableStream/FormData 등 1회성 body 재사용 방지
      return request<T>(path, { ...init, body: init.body }, false);
    }
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const { message, code } = parseErrorBody(text, response.statusText);
    throw new ApiError(response.status, message, code);
  }

  // 204 또는 빈 body (Content-Length 0 / 비어있는 텍스트)는 undefined로 반환
  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

/**
 * SSE 스트리밍 요청.
 * FastAPI → Spring 프록시의 Server-Sent Events를 소비한다.
 * @returns AbortController — 호출자가 abort()로 스트리밍을 취소할 수 있음.
 */
async function streamSSE(
  path: string,
  body: unknown,
  onData: (parsed: unknown) => boolean | void,
  onDone: () => void,
  onError: (err: Error) => void,
): Promise<AbortController> {
  const controller = new AbortController();

  if (!useNetworkStore.getState().isOnline) {
    onError(new ApiError(0, OFFLINE_MESSAGE));
    return controller;
  }

  // 401 재시도는 1회로 제한하여 refresh 루프 방지
  let triedRefresh = false;

  const attempt = async (): Promise<void> => {
    const token = await window.folio.auth.getAccessToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${apiUrl()}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
      credentials: 'include',
    });

    if (response.status === 401 && !triedRefresh) {
      triedRefresh = true;
      const restored = await sharedTryRestore();
      if (restored) return attempt();
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const { message, code } = parseErrorBody(text, response.statusText);
      throw new ApiError(response.status, message, code);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('ReadableStream not supported');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      let earlyDone = false;
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data:')) {
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr) continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const shouldStop = onData(parsed);
            if (shouldStop) {
              earlyDone = true;
              break;
            }
          } catch {
            // 파싱 실패한 라인은 무시
          }
        }
      }
      if (earlyDone) {
        reader.cancel();
        onDone();
        return;
      }
    }
    onDone();
  };

  attempt().catch((err) => {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    onError(err instanceof Error ? err : new Error(String(err)));
  });

  return controller;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  streamSSE,
};
