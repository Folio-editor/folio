import { apiClient } from './apiClient';
import {
  REFUND_POLICY_VERSION,
  type BillingAuthPrepareResponse,
  type CreatePaymentResponse,
  type PaymentResponse,
  type RefundRequest,
  type RefundResponse,
  type SubscriptionResponse,
  type TokenPackageCode,
  type TokenWalletResponse,
} from '../types/payment';

export const paymentApi = {
  getWallet: () => apiClient.get<TokenWalletResponse>('/payments/wallet'),

  /**
   * 결제 요청 생성. 환불 규정 동의({@link REFUND_POLICY_VERSION})를 함께 전달한다.
   * 동의 안 한 상태로는 호출하지 말 것 — 백엔드 `@AssertTrue`로 차단됨.
   */
  createPayment: (packageCode: TokenPackageCode) =>
    apiClient.post<CreatePaymentResponse>('/payments', {
      packageCode,
      agreeRefundPolicy: true,
      refundPolicyVersion: REFUND_POLICY_VERSION,
    }),

  /** PortOne SDK 결제 완료 후 paymentId만 보내 서버 검증 트리거. */
  confirmPayment: (body: { paymentId: string }) =>
    apiClient.post<PaymentResponse>('/payments/confirm', body),

  /** 환불 신청 — 즉시 환불 X. 백엔드가 운영자에게 이메일 발송 후 검토. */
  requestRefund: (paymentId: string, body: RefundRequest) =>
    apiClient.post<RefundResponse>(`/payments/${paymentId}/refund`, body),

  /** 환불 신청 취소 (REQUESTED 상태에서만). */
  cancelRefundRequest: (refundId: string) =>
    apiClient.post<RefundResponse>(`/payments/refunds/${refundId}/cancel`),

  getPayment: (paymentId: string) =>
    apiClient.get<PaymentResponse>(`/payments/${paymentId}`),

  /** 결제 이력 — 최근 순. 각 행에 latestRefund 포함. */
  listMyPayments: () => apiClient.get<PaymentResponse[]>('/payments/me'),
};

export const subscriptionApi = {
  prepareBillingAuth: () =>
    apiClient.post<BillingAuthPrepareResponse>('/subscriptions/billing-auth'),

  /** SDK가 직접 발급한 billingKey와 prepare 단계의 customerKey를 함께 전달. 환불 규정 동의 포함. */
  create: (body: { planCode: string; billingKey: string; customerKey: string }) =>
    apiClient.post<SubscriptionResponse>('/subscriptions', {
      ...body,
      agreeRefundPolicy: true,
      refundPolicyVersion: REFUND_POLICY_VERSION,
    }),

  getMine: () => apiClient.get<SubscriptionResponse>('/subscriptions/me'),

  cancel: () => apiClient.post<SubscriptionResponse>('/subscriptions/cancel'),

  resume: () => apiClient.post<SubscriptionResponse>('/subscriptions/resume'),
};
