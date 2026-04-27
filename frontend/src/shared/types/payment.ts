/**
 * 결제/구독/지갑 API 응답 타입.
 * 백엔드 DTO (com.storyzip.payment.dto.*) 와 1:1 대응.
 */

export interface TokenWalletResponse {
  balance: number;
  subscriptionBalance: number;
  bonusBalance: number;
  bonusExpiresAt: string | null;
  purchaseBalance: number;
  totalCharged: number;
  totalUsed: number;
}

export type TokenPackageCode = 'TOKEN_300' | 'TOKEN_550' | 'TOKEN_1200';

export interface TokenPackageInfo {
  code: TokenPackageCode;
  amount: number;
  tokenQty: number;
  label: string;
}

export const TOKEN_PACKAGES: TokenPackageInfo[] = [
  { code: 'TOKEN_300', amount: 3_000, tokenQty: 300, label: '300 크레딧' },
  { code: 'TOKEN_550', amount: 5_000, tokenQty: 550, label: '550 크레딧' },
  { code: 'TOKEN_1200', amount: 10_000, tokenQty: 1_200, label: '1,200 크레딧' },
];

export interface CreatePaymentResponse {
  orderId: string;
  orderName: string;
  amount: number;
  tokenQty: number;
}

export type PaymentStatus = 'READY' | 'IN_PROGRESS' | 'DONE' | 'FAILED' | 'CANCELLED' | 'REFUNDED';
export type PaymentMethod = 'CARD' | 'VIRTUAL_ACCOUNT' | 'EASY_PAY' | 'TRANSFER' | 'MOBILE_PHONE' | 'CULTURE_GIFT_CERTIFICATE';

export interface PaymentResponse {
  id: string;
  orderId: string;
  paymentKey: string | null;
  amount: number;
  tokenQty: number;
  status: PaymentStatus;
  method: PaymentMethod | null;
  approvedAt: string | null;
  createdAt: string;
}

export interface RefundResponse {
  paymentId: string;
  orderId: string;
  originalAmount: number;
  refundAmount: number;
  tokenDeducted: number;
  refundType: string;
}

export type SubscriptionPlanCode = 'PRO_MONTHLY';
export type SubscriptionStatus = 'ACTIVE' | 'CANCELLED' | 'PAYMENT_FAILED';

export interface SubscriptionPlanInfo {
  code: SubscriptionPlanCode;
  amount: number;
  monthlyTokens: number;
  displayName: string;
}

export const SUBSCRIPTION_PLANS: SubscriptionPlanInfo[] = [
  { code: 'PRO_MONTHLY', amount: 9_900, monthlyTokens: 1_300, displayName: 'Folio Pro 월간' },
];

export interface BillingAuthPrepareResponse {
  customerKey: string;
  clientKey: string;
}

export interface SubscriptionResponse {
  id: string;
  plan: string;
  monthlyTokens: number | null;
  monthlyAmount: number | null;
  status: SubscriptionStatus;
  nextBillingAt: string | null;
  lastPaymentAt: string | null;
  cancelledAt: string | null;
  cancelReserved: boolean;
  createdAt: string;
}

export interface CheckoutParams {
  amount: number;
  orderId: string;
  orderName: string;
  customerKey: string;
}

export interface CheckoutResult {
  paymentKey: string;
  orderId: string;
  amount: number;
}

export interface BillingAuthParams {
  customerKey: string;
}

export interface BillingAuthResult {
  authKey: string;
  customerKey: string;
}
