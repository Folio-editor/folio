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

  confirmPayment: (body: { paymentKey: string; orderId: string; amount: number }) =>
    apiClient.post<PaymentResponse>('/payments/confirm', body),

  refund: (orderId: string) =>
    apiClient.post<RefundResponse>(`/payments/${orderId}/refund`),

  getPayment: (orderId: string) =>
    apiClient.get<PaymentResponse>(`/payments/${orderId}`),
};

export const subscriptionApi = {
  prepareBillingAuth: () =>
    apiClient.post<BillingAuthPrepareResponse>('/subscriptions/billing-auth'),

  create: (body: { planCode: string; authKey: string; customerKey: string }) =>
    apiClient.post<SubscriptionResponse>('/subscriptions', body),

  getMine: () => apiClient.get<SubscriptionResponse>('/subscriptions/me'),

  cancel: () => apiClient.post<SubscriptionResponse>('/subscriptions/cancel'),

  resume: () => apiClient.post<SubscriptionResponse>('/subscriptions/resume'),
};
