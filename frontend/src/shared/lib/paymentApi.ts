import { apiClient } from './apiClient';
import type {
  BillingAuthPrepareResponse,
  CreatePaymentResponse,
  PaymentResponse,
  RefundResponse,
  SubscriptionResponse,
  TokenPackageCode,
  TokenWalletResponse,
} from '../types/payment';

export const paymentApi = {
  getWallet: () => apiClient.get<TokenWalletResponse>('/payments/wallet'),

  createPayment: (packageCode: TokenPackageCode) =>
    apiClient.post<CreatePaymentResponse>('/payments', { packageCode }),

  /** PortOne SDK 결제 완료 후 paymentId만 보내 서버 검증 트리거. */
  confirmPayment: (body: { paymentId: string }) =>
    apiClient.post<PaymentResponse>('/payments/confirm', body),

  refund: (paymentId: string) =>
    apiClient.post<RefundResponse>(`/payments/${paymentId}/refund`),

  getPayment: (paymentId: string) =>
    apiClient.get<PaymentResponse>(`/payments/${paymentId}`),
};

export const subscriptionApi = {
  prepareBillingAuth: () =>
    apiClient.post<BillingAuthPrepareResponse>('/subscriptions/billing-auth'),

  /** SDK가 직접 발급한 billingKey와 prepare 단계의 customerKey를 함께 전달. */
  create: (body: { planCode: string; billingKey: string; customerKey: string }) =>
    apiClient.post<SubscriptionResponse>('/subscriptions', body),

  getMine: () => apiClient.get<SubscriptionResponse>('/subscriptions/me'),

  cancel: () => apiClient.post<SubscriptionResponse>('/subscriptions/cancel'),

  resume: () => apiClient.post<SubscriptionResponse>('/subscriptions/resume'),
};
