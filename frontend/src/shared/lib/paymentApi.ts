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

  /**
   * dev 프로필에서만 열려있는 공개 엔드포인트. 1회성 결제 테스트 시 프론트가
   * Toss SDK에 넘길 clientKey를 받기 위해 호출한다. (구독은 prepareBillingAuth 응답에
   * clientKey가 이미 포함돼 있어 이 helper 불필요.)
   */
  getDevClientKey: async (): Promise<string> => {
    const base = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8080/api/v1').replace(
      /\/api\/v1\/?$/,
      '',
    );
    const res = await fetch(`${base}/api/v1/payments/dev/client-key`);
    if (!res.ok) throw new Error('dev client key 조회 실패 (dev 프로필인지 확인)');
    const json = (await res.json()) as { clientKey: string };
    return json.clientKey;
  },
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
