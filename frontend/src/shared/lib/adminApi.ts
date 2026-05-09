/**
 * 운영자 환불 처리 API 클라이언트.
 *
 * <p>인증: {@code X-Admin-Token} 헤더에 빌드 시점 환경변수
 * {@code VITE_ADMIN_API_TOKEN} 값을 자동 주입.
 *
 * <p>운영자 빌드만 토큰을 환경변수에 박아 배포한다 (`.env.local` 또는 별도 빌드 파이프라인).
 * 일반 사용자에게 배포되는 빌드에는 토큰이 비어있어 모든 요청이 401.
 *
 * <p>JWT refresh / 사용자 인증 흐름과 무관하므로 기존 apiClient 를 거치지 않고
 * 단순 fetch 로 호출한다.
 */

import type {
  PaymentResponse,
  RefundResponse,
  RefundStatus,
} from '../types/payment';

function adminToken(): string {
  return (import.meta.env.VITE_ADMIN_API_TOKEN as string | undefined) ?? '';
}

export function isAdminEnabled(): boolean {
  return adminToken().trim().length > 0;
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
  const token = adminToken();
  if (!token) {
    throw new AdminApiError(0, '관리자 토큰이 설정되지 않았습니다 (VITE_ADMIN_API_TOKEN).');
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
    throw new AdminApiError(res.status, message, code);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * 관리자 RefundResponse 는 백엔드 PaymentResponse.RefundSummary 와 같지만 paymentId/orderId 등이 추가된 형태.
 * 실제 응답은 RefundResponse 타입 (refundId / status / refundType / reason / amount / tokenDeducted 등).
 */
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
