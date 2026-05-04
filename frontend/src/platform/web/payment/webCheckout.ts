// ============================================================
// Web 결제 redirect 어댑터 — Electron의 BrowserWindow를 풀페이지 redirect로 대체
// ============================================================
// Electron은 별창(BrowserWindow)에서 토스 SDK를 띄우고 success/fail URL을
// will-redirect 이벤트로 가로채 결과를 in-process로 회신할 수 있지만, 웹에서는
// 같은 origin에 실제 라우트를 두고 토스가 그 URL로 리다이렉트하도록 한 뒤,
// 결과 페이지에서 백엔드 confirm/create를 직접 호출해야 한다.
//
// 흐름:
//   1) PaymentSettings.handleBuyPackage → window.folio.payment.openOneTime(...)
//   2) 본 모듈이 pending state(returnTo, kind, params)를 sessionStorage에 저장
//   3) 토스 SDK 동적 로드 → toss.requestPayment(...) → 토스가 successUrl로 풀페이지 navigate
//   4) successUrl(/checkout/success) 페이지 = CheckoutResolver — 백엔드 confirmPayment
//      호출 + 결과를 sessionStorage(checkout-result)에 적재 → returnTo로 location.replace
//   5) PaymentSettings가 마운트 시 checkout-result를 읽어 토스트/배너로 노출
// ============================================================

import type {
  FolioBillingAuthParams,
  FolioBillingAuthResult,
  FolioOneTimePaymentParams,
  FolioOneTimePaymentResult,
} from '../../../shared/types/auth';

const SDK_SRC = 'https://js.tosspayments.com/v1/payment';
const PENDING_KEY = 'folio:web:checkout-pending';
const RESULT_KEY = 'folio:web:checkout-result';

export type PendingCheckout =
  | {
      kind: 'one-time';
      orderId: string;
      amount: number;
      returnTo: string;
    }
  | {
      kind: 'billing';
      customerKey: string;
      returnTo: string;
    };

export type CheckoutResult =
  | {
      kind: 'one-time-success';
      orderId: string;
      message: string;
    }
  | {
      kind: 'billing-success';
      message: string;
    }
  | {
      kind: 'fail';
      code: string | null;
      message: string;
    }
  | {
      kind: 'user-closed';
    };

interface TossPaymentsInstance {
  requestPayment: (
    method: string,
    params: {
      amount: number;
      orderId: string;
      orderName: string;
      customerName?: string;
      customerKey: string;
      successUrl: string;
      failUrl: string;
    },
  ) => Promise<void>;
  requestBillingAuth: (
    method: string,
    params: { customerKey: string; successUrl: string; failUrl: string },
  ) => Promise<void>;
}

declare global {
  interface Window {
    TossPayments?: (clientKey: string) => TossPaymentsInstance;
  }
}

let sdkPromise: Promise<void> | null = null;

function loadTossSdk(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR 환경에서는 결제 사용 불가'));
  if (window.TossPayments) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Toss SDK 로드 실패')), { once: true });
      return;
    }
    const s = document.createElement('script');
    s.src = SDK_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Toss SDK 로드 실패'));
    document.head.appendChild(s);
  });
  return sdkPromise;
}

/**
 * 토스 successUrl/failUrl은 절대 URL이어야 하고, 이 origin과 동일한 오리진을 써야
 * 외부 도메인으로 redirect되는 것을 막을 수 있다. base path(/editor)는 vite의
 * import.meta.env.BASE_URL이 '/editor/'로 들어오므로 그대로 활용한다.
 */
function checkoutUrl(suffix: 'success' | 'fail'): string {
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
  return `${window.location.origin}${base}/checkout/${suffix}`;
}

function savePending(p: PendingCheckout): void {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(p));
  } catch {
    /* private mode 등에서 sessionStorage 차단되면 결과 페이지가 fallback 처리 */
  }
}

export function readPending(): PendingCheckout | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingCheckout) : null;
  } catch {
    return null;
  }
}

export function clearPending(): void {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

export function saveResult(r: CheckoutResult): void {
  try {
    sessionStorage.setItem(RESULT_KEY, JSON.stringify(r));
  } catch {
    /* ignore */
  }
}

export function consumeResult(): CheckoutResult | null {
  try {
    const raw = sessionStorage.getItem(RESULT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(RESULT_KEY);
    return JSON.parse(raw) as CheckoutResult;
  } catch {
    return null;
  }
}

function returnToFromCurrent(): string {
  // 현재 페이지(URL hash 포함)를 결과 처리 후 돌아올 위치로 사용.
  // origin은 동일 origin 강제를 위해 path/hash만 보존 (path가 비어있을 일은 없으나 안전망).
  const path = window.location.pathname || '/';
  return path + window.location.search + window.location.hash;
}

export async function webOpenOneTime(
  params: FolioOneTimePaymentParams,
): Promise<FolioOneTimePaymentResult> {
  await loadTossSdk();
  if (!window.TossPayments) throw new Error('Toss SDK 초기화 실패');

  savePending({
    kind: 'one-time',
    orderId: params.orderId,
    amount: params.amount,
    returnTo: returnToFromCurrent(),
  });

  const toss = window.TossPayments(params.clientKey);
  // requestPayment는 성공 시 풀페이지 redirect → 이 Promise는 영원히 resolve되지 않는다.
  // 사용자가 결제창을 닫거나 SDK 단계 에러 발생 시에만 reject되며, 그때는 pending을 폐기한다.
  try {
    await toss.requestPayment('카드', {
      amount: params.amount,
      orderId: params.orderId,
      orderName: params.orderName,
      customerName: 'Folio 사용자',
      customerKey: params.customerKey,
      successUrl: checkoutUrl('success'),
      failUrl: checkoutUrl('fail'),
    });
  } catch (e) {
    clearPending();
    throw normalizeTossError(e);
  }
  // requestPayment가 redirect했다면 여기 도달 전에 페이지가 이동된다.
  // 이론상 도달하지 않으나 타입 만족을 위해 never-resolving Promise 반환.
  return new Promise<FolioOneTimePaymentResult>(() => {});
}

export async function webOpenBillingAuth(
  params: FolioBillingAuthParams,
): Promise<FolioBillingAuthResult> {
  await loadTossSdk();
  if (!window.TossPayments) throw new Error('Toss SDK 초기화 실패');

  savePending({
    kind: 'billing',
    customerKey: params.customerKey,
    returnTo: returnToFromCurrent(),
  });

  const toss = window.TossPayments(params.clientKey);
  try {
    await toss.requestBillingAuth('카드', {
      customerKey: params.customerKey,
      successUrl: checkoutUrl('success'),
      failUrl: checkoutUrl('fail'),
    });
  } catch (e) {
    clearPending();
    throw normalizeTossError(e);
  }
  return new Promise<FolioBillingAuthResult>(() => {});
}

/**
 * Toss SDK가 던지는 영문 에러 → 사용자 친화 한글로 정제.
 * USER_CANCEL/PAY_PROCESS_CANCELED 등 사용자 취소 코드는 PaymentSettings의
 * isUserClosed가 잡을 수 있도록 'USER_CLOSED'로 통일한다.
 */
function normalizeTossError(e: unknown): Error {
  const raw = e instanceof Error ? e : new Error(String(e));
  const code = (e as { code?: string } | null)?.code ?? '';
  if (/USER_CANCEL|PAY_PROCESS_CANCELED/i.test(code)) {
    const err = new Error('결제창이 닫혔습니다.');
    (err as Error & { code?: string }).code = 'USER_CLOSED';
    return err;
  }
  if (/postMessage|target origin/i.test(raw.message)) {
    return new Error('결제창을 여는 중 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해주세요.');
  }
  return raw;
}
