// ============================================================
// Web 결제 어댑터 — PortOne SDK 모달 기반
// ============================================================
// PortOne V2 SDK는 모달/팝업으로 결제창을 띄우고 결과를 Promise<Response>로 직접 반환한다.
// (토스가 풀페이지 redirect였던 것과 달리 SPA 흐름을 깨지 않음)
//
// 흐름:
//   1) PaymentSettings → openOneTimeCheckout(params) (shared/lib/paymentCheckout)
//   2) PortOne.requestPayment 호출 → 모달 자동 표시
//   3) 사용자가 결제 완료/취소 시 Promise resolve
//   4) 호출자가 응답을 받아 백엔드 confirm 호출
// ============================================================

import PortOne from '@portone/browser-sdk/v2';

import type {
  FolioBillingAuthParams,
  FolioBillingAuthResult,
  FolioOneTimePaymentParams,
  FolioOneTimePaymentResult,
} from '../../../shared/types/auth';

/**
 * PortOne 응답에 code/message가 있으면 실패 — 사용자 취소도 같은 채널로 도착한다.
 * 취소 코드(USER_CANCEL 계열)는 'USER_CLOSED'로 정규화해 PaymentSettings의 isUserClosed가 잡도록 한다.
 */
function toCheckoutError(code: string, message: string): Error {
  if (/CANCEL|CLOSED|USER_CANCEL/i.test(code)) {
    const err = new Error(message || '결제창이 닫혔습니다.');
    (err as Error & { code?: string }).code = 'USER_CLOSED';
    return err;
  }
  const err = new Error(message || '결제 실패');
  (err as Error & { code?: string }).code = code;
  return err;
}

/**
 * 일회성 결제 — 신용카드 단일 결제창.
 *
 * <p>★ 임시 단순화 (긴급 prod 복구): PortOne V2 의 {@code requestPayment} 는 결제수단 선택
 * 모달을 제공하지 않고 {@code payMethod} 가 필수. 옵션 A({@code payMethod} 생략) 시 SDK 가
 * "payMethod 는 필수 파라미터입니다" 에러를 던져 결제가 깨졌던 회귀 복구.
 *
 * <p>본격 통합 결제 UI (카드 + 카카오페이 동시 노출) 는 별도 PR 에서 {@code loadPaymentUI}
 * 기반으로 재구성 예정 — SDK 가 통합 UI 를 제공하는 인라인 렌더링 API. 그때까지는 신용카드
 * 단일로 운영 (캡처 흐름 = BillGate 약관 → 카드사 선택 → 카드사 인증).
 */
export async function webOpenOneTime(
  params: FolioOneTimePaymentParams,
): Promise<FolioOneTimePaymentResult> {
  const response = await PortOne.requestPayment({
    storeId: params.storeId,
    channelKey: params.channelKey,
    paymentId: params.paymentId,
    orderName: params.orderName,
    totalAmount: params.amount,
    currency: 'KRW',
    payMethod: 'CARD',
    customer: { customerId: params.customerKey },
  } as Parameters<typeof PortOne.requestPayment>[0]);

  // SDK가 modal close에서 undefined를 반환하는 케이스 — 사용자 취소로 간주.
  if (!response) {
    const err = new Error('결제창이 닫혔습니다.');
    (err as Error & { code?: string }).code = 'USER_CLOSED';
    throw err;
  }
  if (response.code) {
    throw toCheckoutError(response.code, response.message ?? '');
  }

  return { paymentId: response.paymentId };
}

/**
 * 빌링키 발급 — 정기결제용 카드 등록.
 *
 * <p>PortOne V2 의 빌링키 발급은 {@code billingKeyMethod} 가 필수. 일회성 결제와 달리
 * 통합 모달 없이 결제수단을 지정해야 한다. 정기결제는 신용카드를 기본으로 한다 — 카카오페이/
 * 네이버페이 등 간편결제는 빌링키 발급이 지원되지 않는 경우가 많고, 사용자 입장에서도 정기결제
 * 는 카드 등록이 가장 직관적.
 */
export async function webOpenBillingAuth(
  params: FolioBillingAuthParams,
): Promise<FolioBillingAuthResult> {
  const response = await PortOne.requestIssueBillingKey({
    storeId: params.storeId,
    channelKey: params.channelKey,
    billingKeyMethod: 'CARD',
    customer: { customerId: params.customerKey },
    issueName: 'Folio Pro 정기결제 카드 등록',
  } as Parameters<typeof PortOne.requestIssueBillingKey>[0]);

  if (!response) {
    const err = new Error('카드 등록창이 닫혔습니다.');
    (err as Error & { code?: string }).code = 'USER_CLOSED';
    throw err;
  }
  if (response.code) {
    throw toCheckoutError(response.code, response.message ?? '');
  }

  return { billingKey: response.billingKey, customerKey: params.customerKey };
}
