import { BrowserWindow } from 'electron';
import type { BrowserWindow as BrowserWindowType } from 'electron';

/**
 * Electron 안에서 토스 결제창을 띄우는 전용 BrowserWindow.
 *
 * <p>토스 SDK를 data URL HTML에 로드해 `requestPayment` / `requestBillingAuth`를 호출한다.
 * successUrl/failUrl은 토스가 허용하는 `http://localhost` 호스트를 사용하고,
 * `will-redirect` 이벤트에서 이를 가로채 쿼리 파라미터를 파싱한 뒤 창을 닫는다.
 * → 외부 브라우저 리다이렉트 없이 SPA 상태를 보존한 채 결제 결과를 수신.
 *
 * <p>가상 호스트(예: https://folio-checkout.local)는 토스 SDK 가
 * INCORRECT_SUCCESS_URL_FORMAT 으로 거부하므로 사용 불가.
 */

const CHECKOUT_BASE = 'http://localhost/folio-checkout';
const CHECKOUT_SUCCESS_URL = `${CHECKOUT_BASE}/success`;
const CHECKOUT_FAIL_URL = `${CHECKOUT_BASE}/fail`;

export interface OneTimePaymentParams {
  clientKey: string;
  amount: number;
  orderId: string;
  orderName: string;
  customerKey: string;
}

export interface OneTimePaymentResult {
  paymentKey: string;
  orderId: string;
  amount: number;
}

export interface BillingAuthParams {
  clientKey: string;
  customerKey: string;
}

export interface BillingAuthResult {
  authKey: string;
  customerKey: string;
}

export type CheckoutFailure = {
  code: string | null;
  message: string | null;
};

/**
 * 토스 SDK가 던지는 영문 에러를 사용자 친화 한글로 치환.
 * data: URL로 SDK를 로드하면 origin이 'null'이라 postMessage가 실패하면서
 * `Failed to execute 'postMessage' on 'DOMWindow' ...` 같은 raw 영문 메시지가 노출됨.
 */
const FRIENDLY_ERROR_SHIM = `
function toFriendlyMessage(e) {
  const raw = (e && (e.message || e.toString())) || '';
  if (/postMessage/i.test(raw) || /target origin/i.test(raw) || /origin\\s*\\(?\\s*['"\`]?null/i.test(raw)) {
    return '결제창을 여는 중 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해주세요.';
  }
  if (/INVALID_TARGET_ORIGIN/i.test(e && e.code || '')) {
    return '결제창을 여는 중 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해주세요.';
  }
  return raw || '결제 처리 중 오류가 발생했습니다.';
}
`;

function buildOneTimeHtml(p: OneTimePaymentParams): string {
  const payload = JSON.stringify(p);
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>Folio 결제</title>
<script src="https://js.tosspayments.com/v1/payment"></script>
<style>
  body { font-family: system-ui, sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; color:#4b5563; }
</style>
</head>
<body>
<div id="status">결제창을 여는 중…</div>
<script>
  ${FRIENDLY_ERROR_SHIM}
  const P = ${payload};
  try {
    const toss = TossPayments(P.clientKey);
    toss.requestPayment("카드", {
      amount: Number(P.amount),
      orderId: String(P.orderId),
      orderName: String(P.orderName),
      customerName: "Folio 사용자",
      customerKey: String(P.customerKey),
      successUrl: ${JSON.stringify(CHECKOUT_SUCCESS_URL)},
      failUrl: ${JSON.stringify(CHECKOUT_FAIL_URL)},
    }).catch((e) => {
      const qs = new URLSearchParams({ code: e.code || '', message: toFriendlyMessage(e) });
      location.href = ${JSON.stringify(CHECKOUT_FAIL_URL)} + '?' + qs.toString();
    });
  } catch (e) {
    const qs = new URLSearchParams({ code: 'SDK_INIT', message: toFriendlyMessage(e) });
    location.href = ${JSON.stringify(CHECKOUT_FAIL_URL)} + '?' + qs.toString();
  }
  window.addEventListener('error', (ev) => {
    const msg = (ev.error && ev.error.message) || ev.message || '';
    if (/postMessage/i.test(msg) || /target origin/i.test(msg)) {
      const qs = new URLSearchParams({
        code: 'POSTMESSAGE_FAIL',
        message: '결제창을 여는 중 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해주세요.',
      });
      location.href = ${JSON.stringify(CHECKOUT_FAIL_URL)} + '?' + qs.toString();
    }
  });
</script>
</body>
</html>`;
}

function buildBillingAuthHtml(p: BillingAuthParams): string {
  const payload = JSON.stringify(p);
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>Folio 구독 카드 등록</title>
<script src="https://js.tosspayments.com/v1/payment"></script>
<style>
  body { font-family: system-ui, sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; color:#4b5563; }
</style>
</head>
<body>
<div id="status">카드 등록창을 여는 중…</div>
<script>
  ${FRIENDLY_ERROR_SHIM}
  const P = ${payload};
  try {
    const toss = TossPayments(P.clientKey);
    toss.requestBillingAuth("카드", {
      customerKey: String(P.customerKey),
      successUrl: ${JSON.stringify(CHECKOUT_SUCCESS_URL)},
      failUrl: ${JSON.stringify(CHECKOUT_FAIL_URL)},
    }).catch((e) => {
      const qs = new URLSearchParams({ code: e.code || '', message: toFriendlyMessage(e) });
      location.href = ${JSON.stringify(CHECKOUT_FAIL_URL)} + '?' + qs.toString();
    });
  } catch (e) {
    const qs = new URLSearchParams({ code: 'SDK_INIT', message: toFriendlyMessage(e) });
    location.href = ${JSON.stringify(CHECKOUT_FAIL_URL)} + '?' + qs.toString();
  }
  window.addEventListener('error', (ev) => {
    const msg = (ev.error && ev.error.message) || ev.message || '';
    if (/postMessage/i.test(msg) || /target origin/i.test(msg)) {
      const qs = new URLSearchParams({
        code: 'POSTMESSAGE_FAIL',
        message: '카드 등록창을 여는 중 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해주세요.',
      });
      location.href = ${JSON.stringify(CHECKOUT_FAIL_URL)} + '?' + qs.toString();
    }
  });
</script>
</body>
</html>`;
}

function openCheckout<T>(
  parent: BrowserWindowType | null,
  html: string,
  parseSuccess: (url: URL) => T | null,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 920,
      height: 820,
      minWidth: 720,
      minHeight: 640,
      parent: parent ?? undefined,
      modal: Boolean(parent),
      resizable: true,
      minimizable: false,
      maximizable: false,
      title: 'Folio 결제',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
      if (!win.isDestroyed()) win.close();
    };

    const handleNavigation = (urlString: string) => {
      if (!urlString.startsWith(CHECKOUT_BASE)) return false;
      try {
        const u = new URL(urlString);
        if (u.pathname === '/folio-checkout/success') {
          const result = parseSuccess(u);
          if (result) {
            settle(() => resolve(result));
          } else {
            settle(() => reject(new Error('결제 결과 파라미터가 올바르지 않습니다.')));
          }
          return true;
        }
        if (u.pathname === '/folio-checkout/fail') {
          const code = u.searchParams.get('code');
          const message = u.searchParams.get('message') ?? '결제가 취소되었습니다.';
          const err = new Error(message);
          (err as Error & { code?: string }).code = code ?? undefined;
          settle(() => reject(err));
          return true;
        }
      } catch {
        // 파싱 실패 시 그대로 통과
      }
      return false;
    };

    win.webContents.on('will-redirect', (event, url) => {
      if (handleNavigation(url)) event.preventDefault();
    });
    win.webContents.on('will-navigate', (event, url) => {
      if (handleNavigation(url)) event.preventDefault();
    });

    win.on('closed', () => {
      if (!settled) {
        settled = true;
        const err = new Error('결제창이 닫혔습니다.');
        (err as Error & { code?: string }).code = 'USER_CLOSED';
        reject(err);
      }
    });

    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
    void win.loadURL(dataUrl);
  });
}

export async function openOneTimePayment(
  parent: BrowserWindowType | null,
  params: OneTimePaymentParams,
): Promise<OneTimePaymentResult> {
  return openCheckout(parent, buildOneTimeHtml(params), (u) => {
    const paymentKey = u.searchParams.get('paymentKey');
    const orderId = u.searchParams.get('orderId');
    const amount = u.searchParams.get('amount');
    if (!paymentKey || !orderId || !amount) return null;
    return { paymentKey, orderId, amount: Number(amount) };
  });
}

export async function openBillingAuth(
  parent: BrowserWindowType | null,
  params: BillingAuthParams,
): Promise<BillingAuthResult> {
  return openCheckout(parent, buildBillingAuthHtml(params), (u) => {
    const authKey = u.searchParams.get('authKey');
    const customerKey = u.searchParams.get('customerKey');
    if (!authKey || !customerKey) return null;
    return { authKey, customerKey };
  });
}
