// ============================================================
// Platform-aware PortOne 결제창 호출
// ============================================================
// Electron / Web 모두 renderer의 정상 origin에서 PortOne SDK를 직접 호출한다.
// (이전 Electron 구현은 별도 BrowserWindow + data: URL 이었으나 origin=null 이라
// PortOne API CORS에 막혀 "Failed to fetch" 발생 — renderer 모달 흐름으로 통합.)
// ============================================================

import {
  webOpenBillingAuth,
  webOpenOneTime,
} from '../../platform/web/payment/webCheckout';
import type {
  FolioBillingAuthParams,
  FolioBillingAuthResult,
  FolioOneTimePaymentParams,
  FolioOneTimePaymentResult,
} from '../types/auth';

export function openOneTimeCheckout(
  params: FolioOneTimePaymentParams,
): Promise<FolioOneTimePaymentResult> {
  return webOpenOneTime(params);
}

export function openBillingAuthCheckout(
  params: FolioBillingAuthParams,
): Promise<FolioBillingAuthResult> {
  return webOpenBillingAuth(params);
}
