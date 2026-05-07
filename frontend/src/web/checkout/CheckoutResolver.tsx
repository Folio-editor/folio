// ============================================================
// 토스 결제 결과 페이지 (/checkout/success, /checkout/fail)
// ============================================================
// index.tsx가 path 매칭만으로 이 컴포넌트를 단독 렌더한다 (App 트리 우회).
// 이유:
//   - 메인 App은 PowerSync/Auth 복원/에디터 부트스트랩 등 무거운 트리.
//     결제 결과는 confirm 호출 1번 + 즉시 redirect만 하면 되므로 가벼운 페이지를
//     별도로 마운트하는 편이 성능/UX 모두 유리.
//   - sessionStorage(checkout-pending) 기반이라 React Router 통합이 불필요.
//
// 백엔드 호출에는 apiClient를 그대로 쓴다 — 401이면 tryRestore가 RT로 새 AT를
// 자동 발급(localStorage RT 보유). AT는 in-memory였다가 페이지 이동으로 사라졌지만
// RT는 보존됨.
// ============================================================

import { useEffect, useState } from 'react';
import { ApiError } from '../../shared/lib/apiClient';
import { paymentApi, subscriptionApi } from '../../shared/lib/paymentApi';
import {
  clearPending,
  consumeResult,
  readPending,
  saveResult,
  type CheckoutResult,
  type PendingCheckout,
} from '../../platform/web/payment/webCheckout';

interface Props {
  variant: 'success' | 'fail';
}

type Stage = 'processing' | 'redirecting' | 'error';

const SAFE_FALLBACK = '/';

export function CheckoutResolver({ variant }: Props) {
  const [stage, setStage] = useState<Stage>('processing');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const pending = readPending();

      // pending이 사라진 경우(다른 탭에서 결제 완료, sessionStorage 우회 등) →
      // 안전을 위해 confirm을 건너뛰고 메시지만 띄운 채 홈으로 보낸다.
      if (!pending) {
        saveResult({
          kind: 'fail',
          code: 'NO_PENDING',
          message: '결제 정보를 찾을 수 없습니다. 다시 시도해주세요.',
        });
        if (!cancelled) redirect(SAFE_FALLBACK);
        return;
      }

      if (variant === 'fail') {
        const code = params.get('code');
        const message = params.get('message') ?? '결제가 취소되었습니다.';
        // USER_CANCEL/PAY_PROCESS_CANCELED → PaymentSettings에서 침묵 처리
        const isUserCancel = code != null && /USER_CANCEL|PAY_PROCESS_CANCELED/i.test(code);
        saveResult(
          isUserCancel
            ? { kind: 'user-closed' }
            : { kind: 'fail', code, message },
        );
        clearPending();
        if (!cancelled) redirect(pending.returnTo);
        return;
      }

      // success
      try {
        const result = await callBackend(pending, params);
        if (cancelled) return;
        saveResult(result);
        clearPending();
        redirect(pending.returnTo);
      } catch (e) {
        if (cancelled) return;
        const msg = toErrorMessage(e);
        saveResult({ kind: 'fail', code: extractCode(e), message: msg });
        clearPending();
        // confirm 실패도 결국 사용자에게 메시지를 전달해야 하므로 returnTo로 복귀한다.
        // (error 화면을 여기에 띄우면 사용자가 어디로 가야 할지 알 수 없다)
        if (pending.returnTo) {
          redirect(pending.returnTo);
        } else {
          setErrorMessage(msg);
          setStage('error');
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [variant]);

  if (stage === 'error') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h1 style={{ fontSize: 18, margin: 0 }}>결제 처리 실패</h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 8 }}>{errorMessage}</p>
          <a href={SAFE_FALLBACK} style={linkStyle}>처음으로</a>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={{ fontSize: 16, margin: 0 }}>
          {variant === 'success' ? '결제 결과를 처리하고 있습니다…' : '결제 취소를 확인하고 있습니다…'}
        </h1>
        <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 8 }}>
          잠시만 기다려주세요. 자동으로 이전 화면으로 돌아갑니다.
        </p>
      </div>
    </div>
  );
}

async function callBackend(
  pending: PendingCheckout,
  params: URLSearchParams,
): Promise<CheckoutResult> {
  if (pending.kind === 'one-time') {
    const paymentKey = params.get('paymentKey');
    const orderId = params.get('orderId');
    const amountStr = params.get('amount');
    if (!paymentKey || !orderId || !amountStr) {
      throw new Error('결제 결과 파라미터가 올바르지 않습니다.');
    }
    const amount = Number(amountStr);
    // 토스가 돌려준 orderId/amount는 pending 정보와 일치해야 한다 (스푸핑 방어).
    if (orderId !== pending.orderId || amount !== pending.amount) {
      throw new Error('결제 정보가 일치하지 않습니다.');
    }
    const confirmed = await paymentApi.confirmPayment({ paymentKey, orderId, amount });
    return {
      kind: 'one-time-success',
      orderId: confirmed.orderId,
      message: `${confirmed.tokenQty.toLocaleString()} 크레딧 충전 완료`,
    };
  }

  // billing
  const authKey = params.get('authKey');
  const customerKey = params.get('customerKey');
  if (!authKey || !customerKey) {
    throw new Error('카드 등록 결과 파라미터가 올바르지 않습니다.');
  }
  if (customerKey !== pending.customerKey) {
    throw new Error('카드 등록 정보가 일치하지 않습니다.');
  }
  await subscriptionApi.create({ planCode: 'PRO_MONTHLY', authKey, customerKey });
  return {
    kind: 'billing-success',
    message: '구독이 시작됐어요. 이번 달 크레딧이 지급됐습니다.',
  };
}

function redirect(target: string): void {
  // Open Redirect 방어: 동일 origin path만 허용. 절대 URL이거나 protocol-relative이면 fallback.
  const safe = target && target.startsWith('/') && !target.startsWith('//') ? target : SAFE_FALLBACK;
  window.location.replace(safe);
}

function extractCode(e: unknown): string | null {
  if (e instanceof ApiError) return e.code ?? null;
  if (e && typeof e === 'object' && 'code' in e) {
    const c = (e as { code?: unknown }).code;
    return typeof c === 'string' ? c : null;
  }
  return null;
}

function toErrorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message || '결제 승인 실패';
  if (e instanceof Error) return e.message || '결제 승인 실패';
  return '결제 승인 실패';
}

const containerStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'system-ui, sans-serif',
  background: '#f9fafb',
};
const cardStyle: React.CSSProperties = {
  padding: '24px 32px',
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  textAlign: 'center',
  maxWidth: 360,
};
const linkStyle: React.CSSProperties = {
  display: 'inline-block',
  marginTop: 12,
  fontSize: 12,
  color: '#2563eb',
  textDecoration: 'underline',
};

// 결과 transient 메시지를 PaymentSettings 등이 읽을 수 있게 외부에 노출.
export { consumeResult };
