import { useEffect, useState } from 'react';
import { consumeAuthExchangeFailure } from '../../lib/auth';
import { buildLoginUrl } from '../../lib/loginUrl';

/**
 * OAuth 교환 실패 1회성 토스트.
 *
 * <p>마운트 시 sessionStorage 플래그({@code folio:web:auth-exchange-failed}) 를
 * consume — 한 번 표시 후 새로고침해도 다시 뜨지 않음.
 *
 * <p>사유별 메시지 + "다시 시도" CTA. 사용자가 명시적으로 닫지 않아도 12초 후 자동 사라짐.
 */
export function AuthFailureToast() {
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    const r = consumeAuthExchangeFailure();
    if (r) setReason(r);
  }, []);

  useEffect(() => {
    if (!reason) return;
    const t = setTimeout(() => setReason(null), 12_000);
    return () => clearTimeout(t);
  }, [reason]);

  if (!reason) return null;

  const message =
    reason === 'expired'
      ? '로그인 요청이 만료됐어요. 다시 시도해주세요.'
      : reason === 'network'
        ? '네트워크 오류로 로그인 처리에 실패했어요. 잠시 후 다시 시도해주세요.'
        : '로그인 처리 중 오류가 발생했어요. 다시 시도해주세요.';

  return (
    <div
      role="alert"
      className="fixed left-1/2 top-6 z-50 flex max-w-md -translate-x-1/2 items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 shadow-lg"
    >
      <span className="flex-1">{message}</span>
      <a
        href={buildLoginUrl('/?fromLanding=1')}
        className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-900 hover:bg-red-100"
      >
        다시 시도
      </a>
      <button
        type="button"
        onClick={() => setReason(null)}
        aria-label="닫기"
        className="text-red-700 hover:text-red-900"
      >
        ✕
      </button>
    </div>
  );
}
