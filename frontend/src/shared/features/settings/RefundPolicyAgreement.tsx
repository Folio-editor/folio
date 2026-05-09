import { useState } from 'react';
import { Shield } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { REFUND_POLICY_VERSION } from '../../types/payment';

/**
 * 결제 시 표시되는 환불 규정 동의 모달.
 *
 * <p>"동의하고 결제" 버튼을 눌러야 onAgree가 호출되며, 그 시점에 백엔드 createPayment가 호출된다.
 * 동의 시각 + 약관 버전은 Payment 레코드에 영구 보관 (전자상거래법 거래 기록 5년 보관 의무).
 */
export function RefundPolicyAgreement({
  open,
  title,
  amount,
  description,
  onAgree,
  onCancel,
}: {
  open: boolean;
  title: string;
  amount: number;
  description: string;
  onAgree: () => void;
  onCancel: () => void;
}) {
  const [agreed, setAgreed] = useState(false);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-border bg-background shadow-lg">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <Shield size={16} strokeWidth={1.75} />
          <h3 className="text-sm font-semibold text-foreground">환불 규정 확인</h3>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          <div className="mb-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
            <div className="font-medium text-foreground">{title}</div>
            <div className="mt-1 text-muted-foreground">{description}</div>
            <div className="mt-2 text-base font-semibold text-foreground">
              {amount.toLocaleString()}원
            </div>
          </div>

          <h4 className="mb-1.5 text-xs font-semibold text-foreground">환불 규정 요약</h4>
          <ul className="space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
            <li>
              <strong className="text-foreground">청약철회 7일</strong> — 결제일로부터 7일 이내에만
              환불 신청 가능합니다.
            </li>
            <li>
              <strong className="text-foreground">미사용만 환불</strong> — 크레딧을 일부라도 사용한
              경우 단순 변심 환불은 불가합니다 (회사 귀책 제외).
            </li>
            <li>
              <strong className="text-foreground">구독 환불</strong> — 7일 이내 구독 크레딧 미사용에
              한해 전액 환불, 7일 경과 시 차월부터 해지로 안내드립니다.
            </li>
            <li>
              <strong className="text-foreground">회사 귀책</strong> — 서비스 장애 등 회사 귀책 시
              종량제는 결제 시 받은 크레딧 전액을 보너스로 다시 지급, 구독은 전액 현금 환불됩니다.
            </li>
            <li>
              <strong className="text-foreground">검토 절차</strong> — 환불은 즉시 처리되지 않고
              운영자 검토 후 3영업일 이내 안내드립니다. 거절 시 1회 재신청 가능합니다.
            </li>
            <li>
              <strong className="text-foreground">처리 기간</strong> — 승인 후 결제수단으로 3~10
              영업일 이내 환불됩니다.
            </li>
          </ul>

          <div className="mt-3 text-[11px] text-muted-foreground">
            전체 정책: 회사 이용약관 · 환불 정책 (버전 {REFUND_POLICY_VERSION})
          </div>

          <label className="mt-4 flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border"
            />
            <span className="text-xs text-foreground">
              위 환불 규정에 동의하며, 본 결제를 진행합니다.
            </span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button size="sm" variant="outline" onClick={onCancel}>
            취소
          </Button>
          <Button size="sm" disabled={!agreed} onClick={onAgree}>
            동의하고 결제
          </Button>
        </div>
      </div>
    </div>
  );
}
