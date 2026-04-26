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

export type TokenPackageCode = 'TOKEN_5000' | 'TOKEN_20000' | 'TOKEN_50000';

export interface TokenPackageInfo {
  code: TokenPackageCode;
  amount: number;
  tokenQty: number;
  label: string;
}

export const TOKEN_PACKAGES: TokenPackageInfo[] = [
  { code: 'TOKEN_5000', amount: 2_900, tokenQty: 5_000, label: '5,000 크레딧' },
  { code: 'TOKEN_20000', amount: 9_900, tokenQty: 20_000, label: '20,000 크레딧' },
  { code: 'TOKEN_50000', amount: 19_900, tokenQty: 50_000, label: '50,000 크레딧' },
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
  { code: 'PRO_MONTHLY', amount: 9_900, monthlyTokens: 25_000, displayName: 'StoryZip Pro 월간' },
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
