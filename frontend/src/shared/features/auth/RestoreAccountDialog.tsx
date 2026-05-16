import { useEffect } from 'react';
import { Button } from '../../components/ui/Button';
import { parseServerDate } from '../../lib/dateTime';

interface RestoreAccountDialogProps {
  /** 탈퇴 처리된 시각 (ISO-8601) */
  deletedAt: string;
  /** 30일 후 자동 영구삭제 예정 시각 (ISO-8601) */
  restorableUntil: string;
  busy: boolean;
  onRestore: () => void;
  onCancel: () => void;
}

/**
 * 탈퇴 처리된 계정으로 Google 로그인을 시도했을 때 노출되는 다이얼로그.
 *
 * 사용자 동의 시 authStore.restoreAfterWithdrawal() → main 의 새 PKCE 흐름 →
 * 백엔드 /auth/restore (deleted_at = NULL 후 일반 LoginResponse 발급) → 일반 login 후속 흐름.
 *
 * 취소 시 게스트 모드 유지 (탈퇴 시 재매핑된 로컬 데이터로 계속 작업 가능).
 */
export function RestoreAccountDialog({
  deletedAt,
  restorableUntil,
  busy,
  onRestore,
  onCancel,
}: RestoreAccountDialogProps) {
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
        className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-foreground">탈퇴 처리된 계정입니다</h3>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          <p>
            이 Google 계정은 <span className="font-medium text-foreground">{formatDate(deletedAt)}</span>{' '}
            에 탈퇴 처리되었습니다.
          </p>
          <p>
            복구는 <span className="font-medium text-foreground">{formatDate(restorableUntil)}</span>{' '}
            까지 가능하며, 이후에는 모든 클라우드 데이터가 영구 삭제됩니다.
          </p>
          <p>
            지금 복구하시면 탈퇴 전의 클라우드 데이터로 다시 로그인할 수 있어요.
          </p>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            취소
          </Button>
          <Button onClick={onRestore} disabled={busy}>
            {busy ? '복구 중…' : '복구하기'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = parseServerDate(iso);
  if (!d) return iso || '';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}
