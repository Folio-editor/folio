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
 * 일회성 결제 — PortOne 통합 결제창.
 *
 * <p>{@code payMethod} 미지정 시 PortOne 이 채널에 등록된 모든 결제수단(카드, 카카오페이,
 * 네이버페이, 가상계좌 등) 을 모달 1단계에서 사용자가 선택하도록 노출. 결제수단 추가/제거는
 * PortOne 콘솔의 채널 설정에서 처리 — 코드 변경 없이 운영 가능.
 *
 * <p>SDK 0.1.x 의 PaymentRequestUnion 타입은 모든 payMethod 분기를 합한 형태라 payMethod
 * 없이 호출하면 컴파일 에러가 난다. 런타임은 payMethod 가 없으면 통합 모달을 띄우므로 타입만
 * 우회 (Parameters[0] 캐스팅).
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
