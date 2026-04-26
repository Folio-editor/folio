import { useCallback, useEffect, useMemo, useState } from 'react';
import { Coins, Gift, Loader2, Receipt, Sparkles } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { ApiError } from '../../lib/apiClient';
import { paymentApi, subscriptionApi } from '../../lib/paymentApi';
import { useAuthStore } from '../../stores/authStore';
import {
  SUBSCRIPTION_PLANS,
  TOKEN_PACKAGES,
  type PaymentResponse,
  type SubscriptionResponse,
  type TokenPackageCode,
  type TokenWalletResponse,
} from '../../types/payment';

/**
 * Electron 내부에서 토스 결제 + 3버킷 지갑 + 구독 흐름을 한번에 테스트하는 개발자 화면.
 * - 1회성 결제: createPayment → window.folio.payment.openOneTime → confirmPayment
 * - 구독: prepareBillingAuth → openBillingAuth → create
 * - 환불: 최근 PaymentResponse.orderId 기준
 */
export function PaymentSettings() {
  const writer = useAuthStore((s) => s.writer);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [wallet, setWallet] = useState<TokenWalletResponse | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionResponse | null>(null);
  const [lastPayment, setLastPayment] = useState<PaymentResponse | null>(null);
  const [busyPackage, setBusyPackage] = useState<TokenPackageCode | null>(null);
  const [busySubscription, setBusySubscription] = useState<
    null | 'subscribe' | 'cancel' | 'resume'
  >(null);
  const [busyRefund, setBusyRefund] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const canUse = isAuthenticated && !!writer;

  const refreshWallet = useCallback(async () => {
    if (!canUse) return;
    setWalletLoading(true);
    try {
      const w = await paymentApi.getWallet();
      setWallet(w);
    } catch (e) {
      setError(toErrorMessage(e, '지갑 조회 실패'));
    } finally {
      setWalletLoading(false);
    }
  }, [canUse]);

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

  useEffect(() => {
    if (!canUse) return;
    void refreshWallet();
    void refreshSubscription();
  }, [canUse, refreshWallet, refreshSubscription]);

  const handleBuyPackage = async (code: TokenPackageCode) => {
    if (!writer) return;
    setError(null);
    setInfo(null);
    setBusyPackage(code);
    try {
      const created = await paymentApi.createPayment(code);
      const clientKey = await paymentApi.getDevClientKey();
      const checkout = await window.folio.payment.openOneTime({
        clientKey,
        amount: created.amount,
        orderId: created.orderId,
        orderName: created.orderName,
        customerKey: writer.id,
      });
      const confirmed = await paymentApi.confirmPayment({
        paymentKey: checkout.paymentKey,
        orderId: checkout.orderId,
        amount: checkout.amount,
      });
      setLastPayment(confirmed);
      setInfo(`${created.tokenQty.toLocaleString()} 크레딧 충전 완료`);
      await refreshWallet();
    } catch (e) {
      setError(toErrorMessage(e, '결제 실패'));
    } finally {
      setBusyPackage(null);
    }
  };

  const handleSubscribe = async () => {
    if (!writer) return;
    setError(null);
    setInfo(null);
    setBusySubscription('subscribe');
    try {
      const prep = await subscriptionApi.prepareBillingAuth();
      const auth = await window.folio.payment.openBillingAuth({
        clientKey: prep.clientKey,
        customerKey: prep.customerKey,
      });
      const sub = await subscriptionApi.create({
        planCode: 'PRO_MONTHLY',
        authKey: auth.authKey,
        customerKey: auth.customerKey,
      });
      setSubscription(sub);
      setInfo('구독이 시작됐어요. 이번 달 크레딧이 지급됐습니다.');
      await refreshWallet();
    } catch (e) {
      setError(toErrorMessage(e, '구독 실패'));
    } finally {
      setBusySubscription(null);
    }
  };

  const handleCancel = async () => {
    setError(null);
    setInfo(null);
    setBusySubscription('cancel');
    try {
      const sub = await subscriptionApi.cancel();
      setSubscription(sub);
      setInfo('다음 결제일에 해지 예정으로 표시됩니다.');
    } catch (e) {
      setError(toErrorMessage(e, '해지 실패'));
    } finally {
      setBusySubscription(null);
    }
  };

  const handleResume = async () => {
    setError(null);
    setInfo(null);
    setBusySubscription('resume');
    try {
      const sub = await subscriptionApi.resume();
      setSubscription(sub);
      setInfo('해지 예약을 철회했습니다.');
    } catch (e) {
      setError(toErrorMessage(e, '재개 실패'));
    } finally {
      setBusySubscription(null);
    }
  };

  const handleRefund = async () => {
    if (!lastPayment) return;
    setError(null);
    setInfo(null);
    setBusyRefund(true);
    try {
      const refund = await paymentApi.refund(lastPayment.orderId);
      setInfo(
        `환불 완료: ${refund.refundType} · ${refund.refundAmount.toLocaleString()}원 / 차감 ${refund.tokenDeducted.toLocaleString()} 크레딧`,
      );
      await refreshWallet();
      setLastPayment(null);
    } catch (e) {
      setError(toErrorMessage(e, '환불 실패'));
    } finally {
      setBusyRefund(false);
    }
  };

  const bonusExpiry = useMemo(
    () => (wallet?.bonusExpiresAt ? formatDate(wallet.bonusExpiresAt) : null),
    [wallet?.bonusExpiresAt],
  );

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-6">
        <h2 className="text-sm font-semibold text-foreground">결제 / 구독</h2>
        <span className="text-[10px] text-muted-foreground">
          토스 테스트 결제 (실제 결제 아님)
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
                      onClick={() => void handleBuyPackage(pkg.code)}
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
                    onSubscribe={() => void handleSubscribe()}
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

          {lastPayment && (
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Receipt size={14} strokeWidth={1.75} />
                최근 결제
              </h3>
              <div className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3">
                <div className="min-w-0 text-[11px] text-muted-foreground">
                  <div className="font-mono text-foreground">{lastPayment.orderId}</div>
                  <div>
                    {lastPayment.amount.toLocaleString()}원 · +
                    {lastPayment.tokenQty.toLocaleString()} 크레딧 · {lastPayment.status}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busyRefund || lastPayment.status !== 'DONE'}
                  onClick={() => void handleRefund()}
                >
                  {busyRefund ? (
                    <>
                      <Loader2 size={12} className="animate-spin" />
                      환불 중
                    </>
                  ) : (
                    '환불'
                  )}
                </Button>
              </div>
            </section>
          )}
        </div>
      </div>
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

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function toErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    return `${fallback}: [${e.status}] ${e.message}`;
  }
  if (e instanceof Error) {
    if ((e as Error & { code?: string }).code === 'USER_CLOSED') {
      return '결제창이 닫혔습니다.';
    }
    return `${fallback}: ${e.message}`;
  }
  return `${fallback}: ${String(e)}`;
}
