import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Loader2,
  LogOut,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import {
  AdminApiError,
  adminApi,
  clearAdminToken,
  isAdminAuthenticated,
  isAdminEntryPointAccessible,
  setAdminToken,
  type AdminRefundDetail,
} from '../../lib/adminApi';
import { parseServerDate } from '../../lib/dateTime';
import type { PaymentMethod, RefundReason, RefundStatus, RefundType } from '../../types/payment';

/**
 * 운영자 환불 검토 화면.
 *
 * <p>흐름:
 * <ol>
 *   <li>진입 가능 여부 (URL ?admin=1 또는 localStorage 토큰): 안 되면 메뉴 자체가 안 보임</li>
 *   <li>토큰 미입력: 토큰 입력 폼</li>
 *   <li>토큰 입력 후 첫 API 호출이 성공: 정상 페이지</li>
 *   <li>API 401: 토큰 자동 삭제 + 입력 폼 다시</li>
 * </ol>
 *
 * <p>토큰은 localStorage 에 8시간 만료로 저장. 만료되면 자동 삭제 + 재입력.
 */
export function AdminRefundsPage() {
  // DevTools 사회공학 방어 경고는 AppRoot 의 useEffect 에서 전역 1회 출력 — 여기선 생략.
  // 진입 가능 여부 자체를 막음 (메뉴를 우회해 직접 라우팅했을 때 방어).
  if (!isAdminEntryPointAccessible()) {
    return <UnauthorizedNotice />;
  }

  return <AdminRefundsContent />;
}

function UnauthorizedNotice() {
  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-10 shrink-0 items-center border-b border-border px-6">
        <h2 className="text-sm font-semibold text-foreground">접근 불가</h2>
      </div>
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="max-w-sm rounded-lg border border-dashed border-border bg-muted/30 px-5 py-6 text-center">
          <ShieldAlert size={28} strokeWidth={1.5} className="mx-auto mb-2 text-muted-foreground" />
          <p className="text-xs text-foreground">운영자 페이지에 접근할 수 없습니다.</p>
        </div>
      </div>
    </div>
  );
}

const STATUS_TABS: { id: RefundStatus; label: string; icon: typeof Clock }[] = [
  { id: 'REQUESTED', label: '검토 대기', icon: Clock },
  { id: 'APPROVED', label: '승인됨', icon: CheckCircle2 },
  { id: 'REJECTED', label: '거절됨', icon: XCircle },
  { id: 'CANCELED', label: '사용자 철회', icon: XCircle },
];

interface DialogState {
  refund: AdminRefundDetail;
  action: 'approve' | 'reject';
}

function AdminRefundsContent() {
  const [authenticated, setAuthenticated] = useState(isAdminAuthenticated());

  if (!authenticated) {
    return <TokenInputForm onAuthenticated={() => setAuthenticated(true)} />;
  }

  return <AdminRefundsBody onLogout={() => setAuthenticated(false)} />;
}

function TokenInputForm({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const trimmed = token.trim();
    if (!trimmed) {
      setError('토큰을 입력해주세요.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // 임시로 저장 후 검증 호출 — 실패하면 자동으로 삭제됨 (adminApi 의 401 처리).
      setAdminToken(trimmed);
      await adminApi.listRefunds('REQUESTED');
      onAuthenticated();
    } catch (e) {
      const msg = e instanceof AdminApiError && e.status === 401
        ? '토큰이 올바르지 않습니다.'
        : e instanceof Error ? e.message : '인증 실패';
      setError(msg);
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-10 shrink-0 items-center border-b border-border px-6">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <ShieldAlert size={14} strokeWidth={1.75} />
          환불 검토 (운영자)
        </h2>
      </div>
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-4 text-center">
            <ShieldAlert
              size={32}
              strokeWidth={1.5}
              className="mx-auto mb-2 text-muted-foreground"
            />
            <h3 className="text-sm font-semibold text-foreground">관리자 토큰 입력</h3>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Doppler 의 <code className="rounded bg-muted px-1">ADMIN_API_TOKEN</code> 값을 입력해주세요.
              브라우저에 <strong>8시간 동안</strong> 저장되며 만료 후 재입력 필요.
            </p>
          </div>
          <input
            type="password"
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSubmit();
            }}
            placeholder="ADMIN_API_TOKEN"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            disabled={busy}
            autoFocus
          />
          {error && (
            <div className="mt-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
              {error}
            </div>
          )}
          <Button
            className="mt-3 w-full"
            disabled={busy || !token.trim()}
            onClick={() => void handleSubmit()}
          >
            {busy ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                인증 중
              </>
            ) : (
              '인증'
            )}
          </Button>
          <p className="mt-3 text-center text-[10px] text-muted-foreground">
            이 페이지는 운영자 전용입니다. 토큰을 모르면 접근하지 마세요.
          </p>
        </div>
      </div>
    </div>
  );
}

function AdminRefundsBody({ onLogout }: { onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState<RefundStatus>('REQUESTED');
  const [refunds, setRefunds] = useState<AdminRefundDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await adminApi.listRefundDetails(activeTab);
      setRefunds(list);
    } catch (e) {
      // 401 이면 토큰이 자동 삭제됨 → 입력 폼으로 복귀.
      if (e instanceof AdminApiError && e.status === 401) {
        onLogout();
        return;
      }
      setError(toErrorMessage(e));
      setRefunds([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, onLogout]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSubmit = async (note: string) => {
    if (!dialog) return;
    setBusy(true);
    setError(null);
    try {
      const result =
        dialog.action === 'approve'
          ? await adminApi.approveRefund(dialog.refund.refundId, note)
          : await adminApi.rejectRefund(dialog.refund.refundId, note);
      setInfo(
        dialog.action === 'approve'
          ? `승인 완료: ${result.orderId} · ${result.refundAmount.toLocaleString()}원 환불`
          : `거절 완료: ${result.orderId}`,
      );
      setDialog(null);
      await refresh();
    } catch (e) {
      if (e instanceof AdminApiError && e.status === 401) {
        onLogout();
        return;
      }
      setError(toErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = () => {
    if (!confirm('관리자 토큰을 삭제하고 로그아웃하시겠어요?')) return;
    clearAdminToken();
    onLogout();
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-6">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <ShieldAlert size={14} strokeWidth={1.75} />
          환불 검토 (운영자)
        </h2>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
            새로고침
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            title="관리자 토큰 삭제"
          >
            <LogOut size={11} />
            로그아웃
          </button>
        </div>
      </div>

      <div className="flex shrink-0 gap-1 border-b border-border bg-muted/20 px-6 py-2">
        {STATUS_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] transition-colors ${
                isActive
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted/40'
              }`}
            >
              <Icon size={12} strokeWidth={1.75} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {error && (
          <div className="mb-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}
        {info && (
          <div className="mb-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-foreground">
            {info}
          </div>
        )}

        {loading && refunds.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-8 text-center text-[11px] text-muted-foreground">
            불러오는 중…
          </div>
        ) : refunds.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-8 text-center text-[11px] text-muted-foreground">
            {STATUS_TABS.find((t) => t.id === activeTab)?.label} 환불이 없습니다.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {refunds.map((r) => (
              <RefundRow
                key={r.refundId}
                refund={r}
                onApprove={() => setDialog({ refund: r, action: 'approve' })}
                onReject={() => setDialog({ refund: r, action: 'reject' })}
              />
            ))}
          </div>
        )}
      </div>

      <DecisionDialog
        open={dialog !== null}
        action={dialog?.action ?? 'approve'}
        refund={dialog?.refund ?? null}
        busy={busy}
        onSubmit={handleSubmit}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}

function RefundRow({
  refund,
  onApprove,
  onReject,
}: {
  refund: AdminRefundDetail;
  onApprove: () => void;
  onReject: () => void;
}) {
  const canDecide = refund.status === 'REQUESTED';
  const within7Days = refund.daysElapsed < 7;
  const isRetry = refund.previousRejectedCount > 0;
  const isCompanyFault = refund.reason === 'COMPANY_FAULT';

  return (
    <div className="rounded-lg border border-border bg-background">
      {/* 헤더 — 상태 / 결제ID / 종류 */}
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[11px] text-foreground">{refund.orderId}</span>
          <span className="text-[10px] text-muted-foreground">
            {refund.isSubscription ? '구독' : '종량제'}
          </span>
          <StatusBadge status={refund.status} />
          {isRetry && (
            <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-900 dark:bg-orange-500/20 dark:text-orange-200">
              재신청 ({refund.previousRejectedCount}회 거절)
            </span>
          )}
          {isCompanyFault && (
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-900 dark:bg-red-500/20 dark:text-red-200">
              회사 귀책
            </span>
          )}
        </div>
        <span
          className={`text-[10px] font-medium ${
            within7Days ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
          }`}
        >
          {within7Days ? '✓ 7일 이내' : '⚠ 7일 경과'} · 경과 {refund.daysElapsed}일
        </span>
      </div>

      {/* 본문 — grid 로 정보 묶음 */}
      <div className="grid grid-cols-1 gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-2">
        {/* 좌: 결제 정보 */}
        <div className="space-y-1">
          <Section title="결제 정보">
            <Row label="금액" value={`${refund.originalAmount.toLocaleString()}원`} />
            <Row label="크레딧" value={refund.tokenQty.toLocaleString()} />
            <Row label="결제 시각" value={formatDate(refund.approvedAt ?? refund.paymentCreatedAt)} />
            <Row label="결제수단" value={formatPaymentMethod(refund.paymentMethod)} />
            <Row label="약관 동의" value={refund.refundPolicyVersion} />
          </Section>
        </div>

        {/* 우: 작가 + 환불 신청 */}
        <div className="space-y-1">
          <Section title="작가">
            <Row label="이메일" value={refund.writerEmail} mono />
            <Row label="닉네임" value={refund.writerNickname} />
            <Row label="작가 ID" value={shortId(refund.writerId)} mono />
          </Section>

          <Section title="환불 신청">
            <Row label="신청 시각" value={formatDate(refund.requestedAt)} />
            <Row label="사유" value={formatReason(refund.reason)} />
            <Row label="분류" value={formatRefundType(refund.refundType)} />
            <Row
              label="처리 결과"
              value={
                refund.refundType === 'COMPANY_FAULT_CREDIT'
                  ? `크레딧 ${refund.tokenDeducted.toLocaleString()} 보상 (현금 X)`
                  : `${refund.refundAmount.toLocaleString()}원 환불 + 크레딧 ${refund.tokenDeducted.toLocaleString()} 회수`
              }
            />
          </Section>
        </div>

        {/* 자유 사유 — 가장 중요한 정보, 풀 너비 */}
        {refund.detail && refund.detail.trim() && (
          <div className="sm:col-span-2">
            <div className="mb-1 text-[10px] font-medium text-muted-foreground">자유 사유</div>
            <div className="rounded-md border border-amber-300/40 bg-amber-50/40 px-3 py-2 text-[11px] leading-relaxed text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              {refund.detail}
            </div>
          </div>
        )}

        {/* 운영자 메모 (이미 처리된 건이면 표시) */}
        {refund.adminNote && (
          <div className="sm:col-span-2">
            <Row label="운영자 메모" value={refund.adminNote} />
          </div>
        )}
      </div>

      {/* 푸터 — 액션 버튼 */}
      {canDecide && (
        <div className="flex items-center justify-end gap-2 border-t border-border/60 px-4 py-2">
          <Button size="sm" variant="outline" onClick={onReject}>
            거절
          </Button>
          <Button size="sm" onClick={onApprove}>
            승인
          </Button>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-medium text-muted-foreground">{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-[11px]">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={`min-w-0 truncate text-right text-foreground ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  );
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

function formatPaymentMethod(method: PaymentMethod | null): string {
  if (!method) return '—';
  switch (method) {
    case 'CARD':
      return '카드';
    case 'EASY_PAY':
      return '간편결제 (카카오페이 등)';
    case 'VIRTUAL_ACCOUNT':
      return '가상계좌';
    case 'TRANSFER':
      return '계좌이체';
    case 'MOBILE_PHONE':
      return '휴대폰';
    case 'CULTURE_GIFT_CERTIFICATE':
      return '문화상품권';
    default:
      return method;
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = parseServerDate(iso);
  if (!d) return iso;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function StatusBadge({ status }: { status: RefundStatus }) {
  const colors: Record<RefundStatus, string> = {
    REQUESTED: 'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200',
    APPROVED: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200',
    REJECTED: 'bg-rose-100 text-rose-900 dark:bg-rose-500/20 dark:text-rose-200',
    CANCELED: 'bg-muted text-muted-foreground',
  };
  const labels: Record<RefundStatus, string> = {
    REQUESTED: '검토 대기',
    APPROVED: '승인됨',
    REJECTED: '거절됨',
    CANCELED: '사용자 철회',
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${colors[status]}`}>
      {labels[status]}
    </span>
  );
}

function DecisionDialog({
  open,
  action,
  refund,
  busy,
  onSubmit,
  onClose,
}: {
  open: boolean;
  action: 'approve' | 'reject';
  refund: AdminRefundDetail | null;
  busy: boolean;
  onSubmit: (note: string) => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) setNote('');
  }, [open]);

  if (!open || !refund) return null;

  const title = action === 'approve' ? '환불 승인' : '환불 거절';
  const description =
    action === 'approve'
      ? '승인 시 PortOne 결제 취소 + 토큰 회수가 자동 진행됩니다 (회사 귀책 종량제는 크레딧 보상).'
      : '거절 시 결제 상태는 그대로 유지되고, 사용자에게 거절 사유가 표시됩니다. 거절 후 1회 재신청 가능.';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-border bg-background shadow-lg">
        <div className="border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
        <div className="overflow-y-auto px-5 py-4">
          <div className="mb-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
            <div className="font-mono text-foreground">{refund.orderId}</div>
            <div className="mt-1 text-muted-foreground">
              {refund.originalAmount.toLocaleString()}원 결제 →{' '}
              {formatRefundType(refund.refundType)}
              {refund.refundAmount > 0 &&
                ` · ${refund.refundAmount.toLocaleString()}원 환불 예정`}
              {refund.tokenDeducted > 0 &&
                ` · 크레딧 ${refund.tokenDeducted.toLocaleString()} 회수/보상 예정`}
            </div>
            <div className="mt-0.5 text-muted-foreground">
              사유: {formatReason(refund.reason)} · 작가 {refund.writerEmail} · 경과 {refund.daysElapsed}일
            </div>
            {refund.detail && refund.detail.trim() && (
              <div className="mt-2 rounded border border-amber-300/40 bg-amber-50/40 px-2 py-1 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                자유 사유: {refund.detail}
              </div>
            )}
          </div>
          <div className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
            {description}
          </div>
          <label className="mb-1.5 block text-xs font-medium text-foreground">
            관리자 메모 (선택, 500자)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 500))}
            rows={3}
            placeholder={
              action === 'approve'
                ? '예: 7일 이내 미사용 - 단순 변심 - 승인'
                : '예: 7일 경과 - 정책상 환불 불가'
            }
            className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <div className="mt-0.5 text-right text-[10px] text-muted-foreground">
            {note.length}/500
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button size="sm" variant="outline" disabled={busy} onClick={onClose}>
            취소
          </Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => onSubmit(note)}
            variant={action === 'reject' ? 'outline' : 'default'}
          >
            {busy ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                처리 중
              </>
            ) : action === 'approve' ? (
              '승인 처리'
            ) : (
              '거절 처리'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function formatReason(reason: RefundReason): string {
  switch (reason) {
    case 'CUSTOMER_CHANGE_OF_MIND':
      return '단순 변심';
    case 'SERVICE_ISSUE':
      return '서비스 불만';
    case 'PAYMENT_ERROR':
      return '결제 오류';
    case 'COMPANY_FAULT':
      return '회사 귀책';
    case 'OTHER':
      return '기타';
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

function toErrorMessage(e: unknown): string {
  if (e instanceof AdminApiError) return e.message;
  if (e instanceof Error) return e.message;
  return '알 수 없는 오류';
}
