/**
 * 운영자 환불 처리 API 클라이언트.
 *
 * <p>인증: {@code X-Admin-Token} 헤더에 운영자가 직접 입력한 토큰 사용.
 * 토큰은 {@code localStorage["folio:admin-token"]} 에 저장.
 *
 * <p>이전엔 빌드 시점 환경변수({@code VITE_ADMIN_API_TOKEN}) 주입 방식이었으나
 * prod 빌드에 토큰이 박히면 누구나 추출 가능 → localStorage 런타임 입력으로 전환.
 *
 * <p>운영자만 진입 경로(URL `?admin=1` 또는 메뉴)를 알고 토큰을 입력해 사용.
 * 일반 사용자는 메뉴/페이지 자체를 못 봄.
 *
 * <p>JWT refresh / 사용자 인증 흐름과 무관하므로 기존 apiClient 를 거치지 않고
 * 단순 fetch 로 호출한다.
 */

import type {
  PaymentResponse,
  RefundResponse,
  RefundStatus,
} from '../types/payment';

const ADMIN_TOKEN_KEY = 'folio:admin-token';

export function getAdminToken(): string {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

export function setAdminToken(token: string): void {
  const trimmed = token.trim();
  if (trimmed) {
    localStorage.setItem(ADMIN_TOKEN_KEY, trimmed);
  } else {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
  }
}

export function clearAdminToken(): void {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

/**
 * 운영자 모드 진입 가능 여부.
 *
 * <p>다음 중 하나면 진입 가능:
 * <ul>
 *   <li>URL 에 {@code ?admin=1} 쿼리 (운영자 본인이 알고 직접 입력)</li>
 *   <li>localStorage 에 토큰이 이미 저장되어 있음 (이전에 진입한 적 있음)</li>
 * </ul>
 *
 * <p>일반 사용자는 둘 다 해당 안 되어 메뉴/페이지 미노출.
 */
export function isAdminEntryPointAccessible(): boolean {
  if (getAdminToken()) return true;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('admin') === '1';
  } catch {
    return false;
  }
}

/** 토큰 검증 완료 여부 — 페이지가 실제 API 호출 가능한 상태인지. */
export function isAdminAuthenticated(): boolean {
  return getAdminToken().length > 0;
}

function apiUrl(): string {
  const url = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8080/api/v1';
  return url.replace(/\/$/, '');
}

export class AdminApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const token = getAdminToken();
  if (!token) {
    throw new AdminApiError(0, '관리자 토큰이 입력되지 않았습니다.');
  }
  const res = await fetch(`${apiUrl()}${path}`, {
    method,
    headers: {
      'X-Admin-Token': token,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let message = res.statusText;
    let code: string | undefined;
    try {
      const text = await res.text();
      if (text) {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object') {
          if (typeof parsed.message === 'string') message = parsed.message;
          if (typeof parsed.code === 'string') code = parsed.code;
        }
      }
    } catch {
      // 비-JSON 응답은 statusText 사용
    }
    // 401 — 토큰이 잘못됐거나 만료. localStorage 정리해서 재입력 유도.
    if (res.status === 401) {
      clearAdminToken();
    }
    throw new AdminApiError(res.status, message, code);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface AdminRefundView extends RefundResponse {}

export interface AdminPaymentDetail extends PaymentResponse {}

export const adminApi = {
  listRefunds: (status: RefundStatus = 'REQUESTED') =>
    request<AdminRefundView[]>('GET', `/admin/refunds?status=${status}`),

  approveRefund: (refundId: string, adminNote?: string) =>
    request<AdminRefundView>('POST', `/admin/refunds/${refundId}/approve`, {
      adminNote: adminNote?.trim() ? adminNote.trim() : undefined,
    }),

  rejectRefund: (refundId: string, adminNote?: string) =>
    request<AdminRefundView>('POST', `/admin/refunds/${refundId}/reject`, {
      adminNote: adminNote?.trim() ? adminNote.trim() : undefined,
    }),
};
