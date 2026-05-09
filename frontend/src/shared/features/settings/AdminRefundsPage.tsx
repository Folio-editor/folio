import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock, Loader2, RefreshCw, ShieldAlert, XCircle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import {
  AdminApiError,
  adminApi,
  isAdminEnabled,
  type AdminRefundView,
} from '../../lib/adminApi';
import type { RefundReason, RefundStatus, RefundType } from '../../types/payment';

/**
 * 운영자 환불 검토 화면.
 *
 * <p>탭으로 status 별 목록 (REQUESTED / APPROVED / REJECTED / CANCELED) 조회.
 * 검토 대기(REQUESTED) 행마다 승인/거절 다이얼로그 → adminApi 호출.
 *
 * <p>VITE_ADMIN_API_TOKEN 미설정 시 안내 화면만 표시 (메뉴 자체도 숨겨짐).
 */
export function AdminRefundsPage() {
  if (!isAdminEnabled()) {
    return <DisabledNotice />;
  }
  return <AdminRefundsContent />;
}

function DisabledNotice() {
  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-10 shrink-0 items-center border-b border-border px-6">
        <h2 className="text-sm font-semibold text-foreground">환불 검토 (운영자)</h2>
      </div>
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="max-w-sm rounded-lg border border-dashed border-border bg-muted/30 px-5 py-6 text-center">
          <ShieldAlert size={28} strokeWidth={1.5} className="mx-auto mb-2 text-muted-foreground" />
          <p className="text-xs text-foreground">관리자 토큰이 설정되지 않았습니다.</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            운영자 빌드에서만 활성화됩니다. <code>.env.local</code>에{' '}
            <code className="rounded bg-muted px-1">VITE_ADMIN_API_TOKEN</code>
            을 설정한 뒤 다시 빌드하세요.
          </p>
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
  refund: AdminRefundView;
  action: 'approve' | 'reject';
}

function AdminRefundsContent() {
  const [activeTab, setActiveTab] = useState<RefundStatus>('REQUESTED');
  const [refunds, setRefunds] = useState<AdminRefundView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await adminApi.listRefunds(activeTab);
      setRefunds(list);
    } catch (e) {
      setError(toErrorMessage(e));
      setRefunds([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

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
      setError(toErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-6">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <ShieldAlert size={14} strokeWidth={1.75} />
          환불 검토 (운영자)
        </h2>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          새로고침
        </button>
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
  refund: AdminRefundView;
  onApprove: () => void;
  onReject: () => void;
}) {
  const isSubscription = refund.orderId.startsWith('SUB-');
  const canDecide = refund.status === 'REQUESTED';

  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[11px] text-foreground">{refund.orderId}</span>
          <span className="text-[10px] text-muted-foreground">
            {isSubscription ? '구독' : '종량제'}
          </span>
          <StatusBadge status={refund.status} />
        </div>
        <div className="mt-1 text-[11px] text-foreground">
          {refund.originalAmount.toLocaleString()}원 결제 → {formatRefundType(refund.refundType)}{' '}
          {refund.refundAmount > 0 && `(${refund.refundAmount.toLocaleString()}원 환불)`}
          {refund.tokenDeducted > 0 && ` · 크레딧 ${refund.tokenDeducted.toLocaleString()}`}
        </div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">
          사유: {formatReason(refund.reason)}
        </div>
      </div>
      {canDecide && (
        <div className="flex shrink-0 flex-col gap-1.5">
          <Button size="sm" onClick={onApprove}>
            승인
          </Button>
          <Button size="sm" variant="outline" onClick={onReject}>
            거절
          </Button>
        </div>
      )}
    </div>
  );
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
  refund: AdminRefundView | null;
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
              사유: {formatReason(refund.reason)}
            </div>
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
