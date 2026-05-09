import { useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import type { PaymentResponse, RefundReason } from '../../types/payment';

const REASON_OPTIONS: { value: RefundReason; label: string; help: string }[] = [
  {
    value: 'CUSTOMER_CHANGE_OF_MIND',
    label: '단순 변심',
    help: '7일 이내 미사용에 한해 환불 가능합니다.',
  },
  {
    value: 'SERVICE_ISSUE',
    label: '서비스 불만',
    help: '서비스 품질에 만족하지 못한 경우.',
  },
  {
    value: 'PAYMENT_ERROR',
    label: '결제 오류 / 중복 결제',
    help: '결제가 잘못되거나 중복된 경우.',
  },
  {
    value: 'COMPANY_FAULT',
    label: '회사 귀책 (서비스 장애)',
    help:
      '서비스 장애 등 회사 귀책 시 종량제는 결제 시 받은 크레딧 전액을 보너스로 다시 지급, 구독은 전액 현금 환불됩니다.',
  },
  { value: 'OTHER', label: '기타', help: '자유 사유에 자세히 입력해주세요.' },
];

/**
 * 결제 이력에서 "환불 신청" 클릭 시 표시되는 다이얼로그.
 *
 * <p>사유 코드 + 자유 사유를 받아 백엔드 requestRefund를 호출한다.
 * 즉시 환불되지 않으며 운영자 검토 후 처리됨을 명시.
 */
export function RefundDialog({
  open,
  payment,
  busy,
  error,
  onSubmit,
  onClose,
}: {
  open: boolean;
  payment: PaymentResponse | null;
  busy: boolean;
  error: string | null;
  onSubmit: (reason: RefundReason, detail: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<RefundReason>('CUSTOMER_CHANGE_OF_MIND');
  const [detail, setDetail] = useState('');

  if (!open || !payment) return null;

  const selectedHelp = REASON_OPTIONS.find((o) => o.value === reason)?.help ?? '';
  const isSubscription = payment.orderId.startsWith('SUB-');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-border bg-background shadow-lg">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold text-foreground">환불 신청</h3>
          <span className="text-[11px] text-muted-foreground">
            {isSubscription ? '구독' : '종량제'}
          </span>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          <div className="mb-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-mono text-foreground">{payment.orderId}</span>
              <span className="font-medium text-foreground">
                {payment.amount.toLocaleString()}원 · +{payment.tokenQty.toLocaleString()} 크레딧
              </span>
            </div>
          </div>

          <div className="mb-3 rounded-md border border-amber-300/40 bg-amber-50/40 px-3 py-2 text-[11px] leading-relaxed text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            <div className="flex items-start gap-1.5">
              <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
              <span>
                환불은 즉시 처리되지 않습니다. 신청 후 운영자 검토를 거쳐 3영업일 이내 결과를
                안내드립니다. 거절 시 1회까지 재신청 가능합니다.
              </span>
            </div>
          </div>

          <label className="mb-1.5 block text-xs font-medium text-foreground">환불 사유</label>
          <div className="mb-3 space-y-1.5">
            {REASON_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-background px-3 py-2 hover:bg-muted/30"
              >
                <input
                  type="radio"
                  name="refund-reason"
                  value={opt.value}
                  checked={reason === opt.value}
                  onChange={() => setReason(opt.value)}
                  className="mt-0.5"
                />
                <div className="min-w-0">
                  <div className="text-xs text-foreground">{opt.label}</div>
                  <div className="text-[10px] text-muted-foreground">{opt.help}</div>
                </div>
              </label>
            ))}
          </div>

          <label className="mb-1.5 block text-xs font-medium text-foreground">
            자유 사유 (선택, 500자 이내)
          </label>
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value.slice(0, 500))}
            rows={3}
            placeholder={
              reason === 'COMPANY_FAULT'
                ? '발생한 장애나 문제 상황을 자세히 적어주시면 검토에 도움이 됩니다.'
                : '환불 사유를 자세히 적어주세요.'
            }
            className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <div className="mt-0.5 text-right text-[10px] text-muted-foreground">
            {detail.length}/500
          </div>

          <div className="mt-2 text-[11px] text-muted-foreground">{selectedHelp}</div>

          {error && (
            <div className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button size="sm" variant="outline" disabled={busy} onClick={onClose}>
            취소
          </Button>
          <Button size="sm" disabled={busy} onClick={() => onSubmit(reason, detail)}>
            {busy ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                신청 중
              </>
            ) : (
              '환불 신청'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
