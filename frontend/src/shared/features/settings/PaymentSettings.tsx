import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Coins,
  Gift,
  History,
  Loader2,
  Receipt,
  Shield,
  Sparkles,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { ApiError } from '../../lib/apiClient';
import { parseServerDate } from '../../lib/dateTime';
import { paymentApi, subscriptionApi } from '../../lib/paymentApi';
import {
  openBillingAuthCheckout,
  openOneTimeCheckout,
} from '../../lib/paymentCheckout';
import { useAuthStore } from '../../stores/authStore';
import { useWalletStore } from '../../stores/walletStore';
import {
  REFUND_POLICY_VERSION,
  SUBSCRIPTION_PLANS,
  TOKEN_PACKAGES,
  type PaymentResponse,
  type RefundReason,
  type RefundStatus,
  type RefundType,
  type SubscriptionResponse,
  type TokenPackageCode,
} from '../../types/payment';
import { RefundDialog } from './RefundDialog';
import { RefundPolicyAgreement } from './RefundPolicyAgreement';

/**
 * 결제·구독·환불 설정 화면.
 *
 * <p>새 정책 (2026-05 약관 v1):
 * <ul>
 *   <li>결제 시 환불 규정 동의 모달 → 동의 후에만 PortOne 결제창</li>
 *   <li>환불은 즉시 X — 신청 후 운영자 검토 (3영업일 이내)</li>
 *   <li>결제 이력에서 각 결제별 환불 신청 가능 여부 / 신청 상태 표시</li>
 * </ul>
 */

function readPortOneEnv() {
  const storeId = (import.meta.env.VITE_PORTONE_STORE_ID as string | undefined) ?? '';
  const channelKeyOneTime =
    (import.meta.env.VITE_PORTONE_CHANNEL_KEY_ONETIME as string | undefined) ?? '';
  const channelKeyBilling =
    (import.meta.env.VITE_PORTONE_CHANNEL_KEY_BILLING as string | undefined) ?? '';
  if (!storeId || !channelKeyOneTime || !channelKeyBilling) {
    throw new Error(
      'PortOne 환경변수가 설정되지 않았습니다 (VITE_PORTONE_STORE_ID / VITE_PORTONE_CHANNEL_KEY_ONETIME / VITE_PORTONE_CHANNEL_KEY_BILLING).',
    );
  }
  return { storeId, channelKeyOneTime, channelKeyBilling };
}

type AgreementIntent =
  | { kind: 'package'; code: TokenPackageCode }
  | { kind: 'subscribe' };

export function PaymentSettings() {
  const writer = useAuthStore((s) => s.writer);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const wallet = useWalletStore((s) => s.wallet);
  const walletLoading = useWalletStore((s) => s.loading);
  const refreshWallet = useWalletStore((s) => s.refresh);

  const [subscription, setSubscription] = useState<SubscriptionResponse | null>(null);
  const [payments, setPayments] = useState<PaymentResponse[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);

  const [busyPackage, setBusyPackage] = useState<TokenPackageCode | null>(null);
  const [busySubscription, setBusySubscription] = useState<
    null | 'subscribe' | 'cancel' | 'resume'
  >(null);
  const [busyRefund, setBusyRefund] = useState(false);

  const [agreement, setAgreement] = useState<AgreementIntent | null>(null);
  const [refundTarget, setRefundTarget] = useState<PaymentResponse | null>(null);
  const [refundDialogError, setRefundDialogError] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const canUse = isAuthenticated && !!writer;

  const refreshSubscription = useCallback(async () => {
    if (!canUse) return;
    try {
      const sub = await subscriptionApi.getMine();
      setSubscription(sub);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setSubscription(null);
        return;
      }
      setError(toErrorMessage(e, '구독 조회 실패'));
    }
  }, [canUse]);

  const refreshPayments = useCallback(async () => {
    if (!canUse) return;
    setPaymentsLoading(true);
    try {
      const list = await paymentApi.listMyPayments();
      setPayments(list);
    } catch (e) {
      setError(toErrorMessage(e, '결제 이력 조회 실패'));
    } finally {
      setPaymentsLoading(false);
    }
  }, [canUse]);

  useEffect(() => {
    if (!canUse) return;
    void refreshWallet();
    void refreshSubscription();
    void refreshPayments();
  }, [canUse, refreshWallet, refreshSubscription, refreshPayments]);

  // ─────────── 결제 (동의 → PortOne) ───────────

  const handleBuyPackageClick = (code: TokenPackageCode) => {
    setError(null);
    setInfo(null);
    setAgreement({ kind: 'package', code });
  };

  const handleSubscribeClick = () => {
    setError(null);
    setInfo(null);
    setAgreement({ kind: 'subscribe' });
  };

  const proceedAfterAgreement = async () => {
    if (!agreement || !writer) return;
    const intent = agreement;
    setAgreement(null);

    if (intent.kind === 'package') {
      await runBuyPackage(intent.code);
    } else {
      await runSubscribe();
    }
  };

  const runBuyPackage = async (code: TokenPackageCode) => {
    if (!writer) return;
    setBusyPackage(code);
    try {
      const env = readPortOneEnv();
      const created = await paymentApi.createPayment(code);
      const checkout = await openOneTimeCheckout({
        storeId: env.storeId,
        channelKey: env.channelKeyOneTime,
        paymentId: created.paymentId,
        amount: created.amount,
        orderName: created.orderName,
        customerKey: writer.id,
      });
      const confirmed = await paymentApi.confirmPayment({
        paymentId: checkout.paymentId,
      });
      setInfo(
        `${created.tokenQty.toLocaleString()} 크레딧 충전 완료 (결제 ${confirmed.orderId})`,
      );
      await refreshWallet();
      await refreshPayments();
    } catch (e) {
      handleAsyncError(e, '결제');
    } finally {
      setBusyPackage(null);
    }
  };

  const runSubscribe = async () => {
    if (!writer) return;
    setBusySubscription('subscribe');
    try {
      const env = readPortOneEnv();
      const prep = await subscriptionApi.prepareBillingAuth();
      const auth = await openBillingAuthCheckout({
        storeId: env.storeId,
        channelKey: env.channelKeyBilling,
        customerKey: prep.customerKey,
      });
      const sub = await subscriptionApi.create({
        planCode: 'PRO_MONTHLY',
        billingKey: auth.billingKey,
        customerKey: auth.customerKey,
      });
      setSubscription(sub);
      setInfo('구독이 시작됐어요. 이번 달 크레딧이 지급됐습니다.');
      await refreshWallet();
      await refreshPayments();
    } catch (e) {
      handleAsyncError(e, '구독');
    } finally {
      setBusySubscription(null);
    }
  };

  // ─────────── 구독 해지 / 재개 ───────────

  const handleCancel = async () => {
    if (busySubscription !== null) return;
    setError(null);
    setInfo(null);
    setBusySubscription('cancel');
    try {
      const sub = await subscriptionApi.cancel();
      setSubscription(sub);
      setInfo('다음 결제일에 해지 예정으로 표시됩니다.');
    } catch (e) {
      handleAsyncError(e, '해지');
    } finally {
      setBusySubscription(null);
    }
  };

  const handleResume = async () => {
    if (busySubscription !== null) return;
    setError(null);
    setInfo(null);
    setBusySubscription('resume');
    try {
      const sub = await subscriptionApi.resume();
      setSubscription(sub);
      setInfo('해지 예약을 철회했습니다.');
    } catch (e) {
      handleAsyncError(e, '재개');
    } finally {
      setBusySubscription(null);
    }
  };

  // ─────────── 환불 신청 ───────────

  const openRefundDialog = (payment: PaymentResponse) => {
    setError(null);
    setInfo(null);
    setRefundDialogError(null);
    setRefundTarget(payment);
  };

  const cancelRefundRequest = async (refundId: string) => {
    setError(null);
    setInfo(null);
    if (!confirm('환불 신청을 철회하시겠어요? 검토 대기 중인 신청만 철회할 수 있습니다.')) return;
    try {
      await paymentApi.cancelRefundRequest(refundId);
      setInfo('환불 신청을 철회했습니다.');
      await refreshPayments();
    } catch (e) {
      handleAsyncError(e, '환불 신청 철회');
    }
  };

  const submitRefund = async (reason: RefundReason, detail: string) => {
    if (!refundTarget) return;
    setBusyRefund(true);
    setRefundDialogError(null);
    try {
      const refund = await paymentApi.requestRefund(refundTarget.orderId, {
        reason,
        detail: detail.trim() ? detail.trim() : undefined,
      });
      const friendly = formatRefundOutcome(refund.refundType, refund.refundAmount, refund.tokenDeducted);
      setInfo(`환불 신청 완료 (${refund.orderId}). ${friendly}`);
      setRefundTarget(null);
      await refreshPayments();
    } catch (e) {
      setRefundDialogError(toErrorMessage(e, '환불 신청 실패'));
    } finally {
      setBusyRefund(false);
    }
  };

  // ─────────── 공용 ───────────

  const handleAsyncError = (e: unknown, action: string) => {
    if (isUserClosed(e)) return;
    if (e instanceof ApiError && (e.status === 429 || e.code === 'P011')) {
      setInfo('요청이 너무 빠르게 반복됐어요. 잠시 후 다시 시도해주세요.');
      return;
    }
    setError(toErrorMessage(e, `${action} 실패`));
  };

  const bonusExpiry = useMemo(
    () => (wallet?.bonusExpiresAt ? formatDate(wallet.bonusExpiresAt) : null),
    [wallet?.bonusExpiresAt],
  );

  const agreementContext = useMemo<{
    title: string;
    description: string;
    amount: number;
  } | null>(() => {
    if (!agreement) return null;
    if (agreement.kind === 'package') {
      const pkg = TOKEN_PACKAGES.find((p) => p.code === agreement.code);
      if (!pkg) return null;
      return {
        title: pkg.label,
        description: `${pkg.tokenQty.toLocaleString()} 크레딧 일회성 충전`,
        amount: pkg.amount,
      };
    }
    const plan = SUBSCRIPTION_PLANS[0];
    return {
      title: plan.displayName,
      description: `매달 ${plan.monthlyTokens.toLocaleString()} 크레딧 자동 충전 (자동 갱신)`,
      amount: plan.amount,
    };
  }, [agreement]);

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-6">
        <h2 className="text-sm font-semibold text-foreground">결제 / 구독</h2>
        <span className="text-[10px] text-muted-foreground">
          PortOne 테스트 결제 · 환불 규정 v{REFUND_POLICY_VERSION}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto flex max-w-lg flex-col gap-6">
          {!canUse && (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center text-xs text-muted-foreground">
              로그인 후에 결제/구독 기능을 사용할 수 있습니다.
            </div>
          )}

          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
          {info && (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-foreground">
              {info}
            </div>
          )}

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Coins size={14} strokeWidth={1.75} />
                크레딧 지갑
              </h3>
              <button
                type="button"
                onClick={() => void refreshWallet()}
                className="text-[11px] text-muted-foreground hover:text-foreground"
                disabled={!canUse || walletLoading}
              >
                {walletLoading ? '새로고침 중…' : '새로고침'}
              </button>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold text-foreground">
                  {wallet ? wallet.balance.toLocaleString() : '—'}
                </span>
                <span className="text-xs text-muted-foreground">크레딧</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <BucketCell label="구독" value={wallet?.subscriptionBalance} />
                <BucketCell
                  label="보너스"
                  value={wallet?.bonusBalance}
                  sub={bonusExpiry ? `${bonusExpiry} 만료` : undefined}
                />
                <BucketCell label="구매" value={wallet?.purchaseBalance} />
              </div>
              <div className="mt-3 flex justify-between text-[11px] text-muted-foreground">
                <span>누적 충전 {(wallet?.totalCharged ?? 0).toLocaleString()}</span>
                <span>누적 사용 {(wallet?.totalUsed ?? 0).toLocaleString()}</span>
              </div>
            </div>
          </section>

          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Gift size={14} strokeWidth={1.75} />
              크레딧 패키지 구매
            </h3>
            <div className="flex flex-col gap-2">
              {TOKEN_PACKAGES.map((pkg) => {
                const isBusy = busyPackage === pkg.code;
                return (
                  <div
                    key={pkg.code}
                    className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground">{pkg.label}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {pkg.amount.toLocaleString()}원 · {pkg.tokenQty.toLocaleString()} 크레딧
                      </div>
                    </div>
                    <Button
                      size="sm"
                      disabled={!canUse || busyPackage !== null}
                      onClick={() => handleBuyPackageClick(pkg.code)}
                    >
                      {isBusy ? (
                        <>
                          <Loader2 size={12} className="animate-spin" />
                          결제 중
                        </>
                      ) : (
                        '결제'
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
            <RefundPolicyHint />
          </section>

          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Sparkles size={14} strokeWidth={1.75} />
              구독
            </h3>
            {SUBSCRIPTION_PLANS.map((plan) => (
              <div
                key={plan.code}
                className="rounded-lg border border-border bg-background p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">
                      {plan.displayName}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      월 {plan.amount.toLocaleString()}원 · 매달{' '}
                      {plan.monthlyTokens.toLocaleString()} 크레딧
                    </div>
                  </div>
                  <SubscriptionActions
                    subscription={subscription}
                    busy={busySubscription}
                    disabled={!canUse}
                    onSubscribe={handleSubscribeClick}
                    onCancel={() => void handleCancel()}
                    onResume={() => void handleResume()}
                  />
                </div>
                {subscription && (
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                    <span>상태</span>
                    <span className="text-right text-foreground">
                      {formatSubscriptionStatus(subscription)}
                    </span>
                    <span>다음 결제일</span>
                    <span className="text-right text-foreground">
                      {subscription.nextBillingAt
                        ? formatDate(subscription.nextBillingAt)
                        : '—'}
                    </span>
                    <span>마지막 결제</span>
                    <span className="text-right text-foreground">
                      {subscription.lastPaymentAt
                        ? formatDate(subscription.lastPaymentAt)
                        : '—'}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <History size={14} strokeWidth={1.75} />
                결제 이력
              </h3>
              <button
                type="button"
                onClick={() => void refreshPayments()}
                className="text-[11px] text-muted-foreground hover:text-foreground"
                disabled={!canUse || paymentsLoading}
              >
                {paymentsLoading ? '불러오는 중…' : '새로고침'}
              </button>
            </div>

            {payments.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-6 text-center text-[11px] text-muted-foreground">
                결제 이력이 없습니다.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {payments.map((p) => (
                  <PaymentRow
                    key={p.id}
                    payment={p}
                    onRefundClick={() => openRefundDialog(p)}
                    onCancelRefundClick={(refundId) => void cancelRefundRequest(refundId)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <RefundPolicyAgreement
        open={agreement !== null}
        title={agreementContext?.title ?? ''}
        amount={agreementContext?.amount ?? 0}
        description={agreementContext?.description ?? ''}
        onAgree={() => void proceedAfterAgreement()}
        onCancel={() => setAgreement(null)}
      />

      <RefundDialog
        open={refundTarget !== null}
        payment={refundTarget}
        busy={busyRefund}
        error={refundDialogError}
        onSubmit={(reason, detail) => void submitRefund(reason, detail)}
        onClose={() => setRefundTarget(null)}
      />
    </div>
  );
}

function BucketCell({
  label,
  value,
  sub,
}: {
  label: string;
  value: number | undefined;
  sub?: string;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-background px-2 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-medium text-foreground">
        {value !== undefined ? value.toLocaleString() : '—'}
      </div>
      {sub && <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function RefundPolicyHint() {
  return (
    <div className="mt-2 flex items-start gap-1.5 text-[10px] leading-relaxed text-muted-foreground">
      <Shield size={11} className="mt-0.5 flex-shrink-0" />
      <span>
        결제 시 환불 규정 동의가 필요합니다. 7일 이내 미사용 환불 가능, 회사 귀책은 별도 처리.
      </span>
    </div>
  );
}

function PaymentRow({
  payment,
  onRefundClick,
  onCancelRefundClick,
}: {
  payment: PaymentResponse;
  onRefundClick: () => void;
  onCancelRefundClick: (refundId: string) => void;
}) {
  const refund = payment.latestRefund;
  const isSubscription = payment.orderId.startsWith('SUB-');

  // 환불 신청 가능 조건 — 결제 DONE이고 active 환불 없음.
  const canRequest =
    payment.status === 'DONE' &&
    (refund === null ||
      refund.status === 'REJECTED' ||
      refund.status === 'CANCELED');

  // 신청 철회 가능 — 검토 대기(REQUESTED) 상태에서만.
  const canCancelRequest = refund !== null && refund.status === 'REQUESTED';

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[11px] text-foreground">{payment.orderId}</span>
          <span className="text-[10px] text-muted-foreground">
            {isSubscription ? '구독' : '종량제'}
          </span>
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          {payment.amount.toLocaleString()}원 · +{payment.tokenQty.toLocaleString()} 크레딧 ·{' '}
          {formatPaymentStatus(payment.status)}
        </div>
        <div className="text-[10px] text-muted-foreground">
          {formatDate(payment.approvedAt ?? payment.createdAt)}
        </div>
        {refund && <RefundBadge refund={refund} />}
      </div>
      <div className="flex flex-col gap-1.5">
        {canCancelRequest && refund ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onCancelRefundClick(refund.refundId)}
          >
            신청 철회
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={!canRequest}
            onClick={onRefundClick}
          >
            환불 신청
          </Button>
        )}
      </div>
    </div>
  );
}

function RefundBadge({
  refund,
}: {
  refund: NonNullable<PaymentResponse['latestRefund']>;
}) {
  const statusText = formatRefundStatus(refund.status);
  const typeText = formatRefundType(refund.refundType);
  return (
    <div className="mt-1.5 inline-flex flex-wrap items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-[10px] text-foreground">
      <span className="font-medium">환불 {statusText}</span>
      <span className="text-muted-foreground">·</span>
      <span className="text-muted-foreground">{typeText}</span>
      {refund.refundAmount > 0 && (
        <>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">
            {refund.refundAmount.toLocaleString()}원
          </span>
        </>
      )}
      {refund.tokenDeducted > 0 && (
        <>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">
            크레딧 {refund.tokenDeducted.toLocaleString()}
          </span>
        </>
      )}
    </div>
  );
}

function SubscriptionActions({
  subscription,
  busy,
  disabled,
  onSubscribe,
  onCancel,
  onResume,
}: {
  subscription: SubscriptionResponse | null;
  busy: null | 'subscribe' | 'cancel' | 'resume';
  disabled: boolean;
  onSubscribe: () => void;
  onCancel: () => void;
  onResume: () => void;
}) {
  if (!subscription || subscription.status !== 'ACTIVE') {
    return (
      <Button size="sm" disabled={disabled || busy !== null} onClick={onSubscribe}>
        {busy === 'subscribe' ? (
          <>
            <Loader2 size={12} className="animate-spin" />
            구독 중
          </>
        ) : (
          '구독 시작'
        )}
      </Button>
    );
  }
  if (subscription.cancelReserved) {
    return (
      <Button size="sm" variant="outline" disabled={disabled || busy !== null} onClick={onResume}>
        {busy === 'resume' ? (
          <>
            <Loader2 size={12} className="animate-spin" />
            재개 중
          </>
        ) : (
          '해지 철회'
        )}
      </Button>
    );
  }
  return (
    <Button size="sm" variant="outline" disabled={disabled || busy !== null} onClick={onCancel}>
      {busy === 'cancel' ? (
        <>
          <Loader2 size={12} className="animate-spin" />
          해지 중
        </>
      ) : (
        '해지'
      )}
    </Button>
  );
}

function formatSubscriptionStatus(sub: SubscriptionResponse): string {
  if (sub.status === 'CANCELLED') return '해지됨';
  if (sub.status === 'PAYMENT_FAILED') return '결제 실패';
  return sub.cancelReserved ? '해지 예약' : '활성';
}

function formatPaymentStatus(status: PaymentResponse['status']): string {
  switch (status) {
    case 'READY':
      return '대기';
    case 'IN_PROGRESS':
      return '진행 중';
    case 'DONE':
      return '완료';
    case 'CANCELED':
      return '환불 완료';
    case 'FAILED':
      return '실패';
    case 'REFUNDED':
      return '환불됨';
    default:
      return status;
  }
}

function formatRefundStatus(status: RefundStatus): string {
  switch (status) {
    case 'REQUESTED':
      return '검토 중';
    case 'APPROVED':
      return '승인됨';
    case 'REJECTED':
      return '거절됨';
    case 'CANCELED':
      return '신청 취소';
  }
}

function formatRefundType(type: RefundType): string {
  switch (type) {
    case 'FULL':
      return '전액 환불';
    case 'PARTIAL_USED':
      return '미사용분 환불';
    case 'PARTIAL_DAYS':
      return '잔여 일수 환불';
    case 'COMPANY_FAULT':
      return '회사 귀책 (현금)';
    case 'COMPANY_FAULT_CREDIT':
      return '회사 귀책 (크레딧 보상)';
  }
}

function formatRefundOutcome(type: RefundType, amount: number, tokens: number): string {
  if (type === 'COMPANY_FAULT_CREDIT') {
    return `검토 후 ${tokens.toLocaleString()} 크레딧 보상 예정. 즉시 처리 X.`;
  }
  if (amount > 0 && tokens > 0) {
    return `검토 후 ${amount.toLocaleString()}원 환불 + ${tokens.toLocaleString()} 크레딧 회수 예정.`;
  }
  if (amount > 0) {
    return `검토 후 ${amount.toLocaleString()}원 환불 예정.`;
  }
  return '검토 후 결과를 안내드립니다.';
}

function formatDate(iso: string): string {
  const d = parseServerDate(iso);
  if (!d) return iso;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function isUserClosed(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  if ((e as Error & { code?: string }).code === 'USER_CLOSED') return true;
  return /결제창이 닫혔습니다/.test(e.message);
}

function stripIpcWrap(message: string): string {
  return message
    .replace(/^Error invoking remote method '[^']*':\s*/, '')
    .replace(/^Error:\s*/, '');
}

function toErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    return e.message || fallback;
  }
  if (e instanceof Error) {
    const cleaned = stripIpcWrap(e.message).trim();
    return cleaned || fallback;
  }
  return fallback;
}
