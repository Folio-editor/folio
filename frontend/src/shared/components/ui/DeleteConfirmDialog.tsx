import { Button } from './Button';

interface DeleteConfirmDialogProps {
  title: string;
  message: string;
  warning?: string;
  confirmLabel?: string;
  busyLabel?: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmDialog({
  title,
  message,
  warning = '이 작업은 되돌릴 수 없습니다.',
  confirmLabel = '삭제',
  busyLabel = '삭제 중…',
  busy,
  onConfirm,
  onCancel,
}: DeleteConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-lg bg-background p-5 shadow-lg">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <p className="mt-1 text-xs text-destructive">{warning}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            취소
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={busy}>
            {busy ? busyLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
