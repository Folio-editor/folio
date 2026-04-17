import { useEffect } from 'react';
import { Button } from '../../components/ui/Button';

interface SyncDecisionDialogProps {
  /** 폐기될 로컬 행 수 */
  guestRowCount: number;
  busy: boolean;
  onUseServer: () => void;
  onCancel: () => void;
}

/**
 * 기존 회원이 게스트 모드로 작성한 로컬 데이터가 있을 때만 표시.
 *
 * 상황: 이 계정은 다른 기기에서 작업한 데이터가 클라우드에 있을 수 있다.
 * 로컬 게스트 데이터를 서버에 올리면 기존 클라우드 데이터와 섞여 위험하므로
 * "서버 우선 + 로컬 폐기"를 사용자에게 안내하고 확인받는다.
 *
 * 신규 가입자는 자동 백업이므로 이 다이얼로그가 뜨지 않는다.
 */
export function SyncDecisionDialog({
  guestRowCount,
  busy,
  onUseServer,
  onCancel,
}: SyncDecisionDialogProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [busy, onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-gray-900">기존 계정으로 로그인</h3>
        <p className="mt-2 text-sm text-gray-600">
          이미 사용 중인 계정입니다. 다른 기기에서 작업한 데이터가 있을 수 있어
          <strong className="px-1">서버 데이터를 우선</strong>합니다.
        </p>
        <p className="mt-2 text-sm text-red-600">
          게스트로 작성한 로컬 항목 <strong>{guestRowCount.toLocaleString()}건은 폐기됩니다.</strong>
        </p>

        <div className="mt-5">
          <button
            type="button"
            disabled={busy}
            onClick={onUseServer}
            className="w-full rounded-lg border border-blue-200 bg-blue-50 p-4 text-left transition-colors hover:border-blue-400 hover:bg-blue-100 disabled:opacity-50"
          >
            <div className="flex items-center gap-2">
              <span className="text-base">☁️</span>
              <span className="text-sm font-semibold text-blue-900">서버 데이터로 시작</span>
            </div>
            <p className="mt-1 pl-6 text-xs text-blue-800">
              로컬 임시 데이터를 폐기하고 클라우드 데이터를 불러옵니다.
            </p>
          </button>
        </div>

        <div className="mt-5 flex justify-end">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            취소 (게스트로 돌아가기)
          </Button>
        </div>
      </div>
    </div>
  );
}
