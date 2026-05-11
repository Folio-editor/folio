import { ApiError } from '../../../lib/apiClient';
import { useNavigationStore } from '../../../stores/navigationStore';

/**
 * 402(크레딧 부족) 에러를 다른 일반 에러와 구분하기 위한 sentinel 접두사.
 * 에러 표시 영역은 이 접두사가 붙은 메시지를 받으면 "결제로 이동" 버튼을 함께 렌더링한다.
 */
export const INSUFFICIENT_CREDITS_PREFIX = '__INSUFFICIENT_CREDITS__:';
export const INSUFFICIENT_CREDITS_MESSAGE =
  '크레딧이 부족합니다. 설정 → 결제에서 충전 후 다시 시도해주세요.';

export function describeAiError(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.status === 402) {
    return INSUFFICIENT_CREDITS_PREFIX + INSUFFICIENT_CREDITS_MESSAGE;
  }
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

export function AiErrorBlock({ message }: { message: string }) {
  const openSettings = useNavigationStore((s) => s.openSettings);
  const isInsufficient = message.startsWith(INSUFFICIENT_CREDITS_PREFIX);
  const display = isInsufficient
    ? message.slice(INSUFFICIENT_CREDITS_PREFIX.length)
    : message;
  return (
    <div className="flex flex-col gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
      <span>{display}</span>
      {isInsufficient && (
        <button
          type="button"
          onClick={() => openSettings('payment')}
          className="self-start rounded-md bg-destructive px-2 py-1 text-[11px] font-medium text-destructive-foreground transition-colors hover:bg-destructive/90"
        >
          결제 화면으로 이동
        </button>
      )}
    </div>
  );
}
