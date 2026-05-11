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
 * 일회성 결제 — 신용카드 결제창.
 *
 * <p>채널: KG이니시스 V2 (테스트 모드). PG 가 카드 인증 결제창을 띄워 사용자가 카드사 선택 →
 * 카드사 인증 → 결제 완료 흐름으로 진행. 다양한 결제수단(카카오페이/네이버페이/계좌이체 등)
 * 동시 노출은 후속 PR 에서 {@code loadPaymentUI} 기반으로 도입.
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
    customer: {
      customerId: params.customerKey,
      // KG이니시스 V2 일반결제는 email/phoneNumber 를 필수로 요구. 미입력 시
      // "구매자 ... 필수 입력입니다" 에러로 결제창 호출 실패.
      email: params.customerEmail,
      // Folio 는 Writer 엔티티에 휴대폰 번호를 갖지 않음 (가입 시 미수집).
      // 호출자가 customerPhoneNumber 를 전달했으면 사용, 없으면 더미값.
      // 향후 회원 프로필에 휴대폰 추가 시 진짜 번호로 대체 — Phase B 작업.
      phoneNumber: params.customerPhoneNumber ?? '010-0000-0000',
      ...(params.customerFullName ? { fullName: params.customerFullName } : {}),
    },
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
    customer: {
      customerId: params.customerKey,
      ...(params.customerEmail ? { email: params.customerEmail } : {}),
      // 빌링키 발급도 KG이니시스 등 PG 가 휴대폰 번호를 요구할 수 있어 함께 전달.
      phoneNumber: params.customerPhoneNumber ?? '010-0000-0000',
      ...(params.customerFullName ? { fullName: params.customerFullName } : {}),
    },
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
