/**
 * 결제/구독/지갑 API 응답 타입.
 * 백엔드 DTO (com.storyzip.payment.dto.*) 와 1:1 대응.
 */

/**
 * 페이지네이션 응답 — 백엔드 {@code com.storyzip.common.dto.PageResponse} 와 1:1.
 * page 는 0-based.
 */
export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  hasNext: boolean;
}

export interface TokenWalletResponse {
  balance: number;
  subscriptionBalance: number;
  bonusBalance: number;
  bonusExpiresAt: string | null;
  purchaseBalance: number;
  totalCharged: number;
  totalUsed: number;
}

export type TokenPackageCode = 'TOKEN_3000' | 'TOKEN_5500' | 'TOKEN_12000';

export interface TokenPackageInfo {
  code: TokenPackageCode;
  amount: number;
  tokenQty: number;
  label: string;
}

export const TOKEN_PACKAGES: TokenPackageInfo[] = [
  { code: 'TOKEN_3000', amount: 3_000, tokenQty: 3_000, label: '3,000 크레딧' },
  { code: 'TOKEN_5500', amount: 5_000, tokenQty: 5_500, label: '5,500 크레딧' },
  { code: 'TOKEN_12000', amount: 10_000, tokenQty: 12_000, label: '12,000 크레딧' },
];

export interface CreatePaymentResponse {
  /** PortOne paymentId — SDK requestPayment에 그대로 전달. */
  paymentId: string;
  orderName: string;
  amount: number;
  tokenQty: number;
}

export type PaymentStatus = 'READY' | 'IN_PROGRESS' | 'DONE' | 'FAILED' | 'CANCELED' | 'REFUNDED';
export type PaymentMethod = 'CARD' | 'VIRTUAL_ACCOUNT' | 'EASY_PAY' | 'TRANSFER' | 'MOBILE_PHONE' | 'CULTURE_GIFT_CERTIFICATE';

/** 백엔드 RefundPolicy.CURRENT_VERSION 과 동기화. */
export const REFUND_POLICY_VERSION = 'v1';

export interface RefundSummary {
  refundId: string;
  status: RefundStatus;
  refundType: RefundType;
  reason: RefundReason;
  refundAmount: number;
  tokenDeducted: number;
  requestedAt: string;
  processedAt: string | null;
}

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
  refundPolicyVersion: string | null;
  refundPolicyAgreedAt: string | null;
  /** 가장 최근 환불 신청 — 환불 가능 여부 / 상태 배지 표시에 사용. */
  latestRefund: RefundSummary | null;
}

export type RefundType =
  | 'FULL'
  | 'PARTIAL_USED'
  | 'PARTIAL_DAYS'
  | 'COMPANY_FAULT'
  | 'COMPANY_FAULT_CREDIT';

export type RefundStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'CANCELED';

export type RefundReason =
  | 'CUSTOMER_CHANGE_OF_MIND'
  | 'SERVICE_ISSUE'
  | 'PAYMENT_ERROR'
  | 'COMPANY_FAULT'
  | 'OTHER';

export interface RefundRequest {
  reason: RefundReason;
  detail?: string;
}

export interface RefundResponse {
  paymentId: string;
  orderId: string;
  originalAmount: number;
  refundAmount: number;
  tokenDeducted: number;
  refundType: RefundType;
  reason: RefundReason;
  refundId: string;
  status: RefundStatus;
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
  { code: 'PRO_MONTHLY', amount: 19_800, monthlyTokens: 25_000, displayName: 'Folio Pro 월간' },
];

export interface BillingAuthPrepareResponse {
  customerKey: string;
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
  paymentId: string;
  amount: number;
  orderName: string;
  customerKey: string;
}

export interface CheckoutResult {
  paymentId: string;
}

export interface BillingAuthParams {
  customerKey: string;
}

export interface BillingAuthResult {
  billingKey: string;
  customerKey: string;
}
