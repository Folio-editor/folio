import { useEffect } from 'react';
import {
  FONT_SERIF,
  MODAL_SHADOW,
  RISE_ANIMATION,
  COLOR_BACKDROP,
  BACKDROP_BLUR,
} from '../../constants/folioModalTokens';

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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (busy) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel, onConfirm]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: COLOR_BACKDROP,
        backdropFilter: BACKDROP_BLUR,
        WebkitBackdropFilter: BACKDROP_BLUR,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="folio-delete-title"
        data-folio-dialog
        className="w-full max-w-[440px] rounded-[12px] border border-[#d4d4d4] bg-[#fafaf7] px-7 pt-6 pb-5 text-[#111]"
        style={{
          boxShadow: MODAL_SHADOW,
          animation: RISE_ANIMATION,
        }}
      >
        <style>{`
          @keyframes folioDialogRise {
            from { opacity: 0; transform: translateY(6px); }
          }
          @media (prefers-reduced-motion: reduce) {
            [data-folio-dialog] { animation: none !important; }
          }
        `}</style>

        <div aria-hidden className="mb-3 h-px w-8 bg-[#111] opacity-45" />

        <h3
          id="folio-delete-title"
          className="m-0 text-[18px] font-semibold leading-[1.35] tracking-[-0.015em] text-[#111]"
          style={{ fontFamily: FONT_SERIF }}
        >
          {title}
        </h3>
        <p
          className="m-0 mt-2 text-[13px] leading-[1.7] text-[#6b6b6b]"
          style={{ fontFamily: FONT_SERIF }}
        >
          {message}
        </p>

        <p className="m-0 mt-2.5 flex items-center gap-2 text-[11.5px] uppercase tracking-[0.15em] text-[#a01818]">
          <span aria-hidden className="inline-block h-px w-3 bg-[#a01818]" />
          {warning}
        </p>

        <div className="mt-5 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-[6px] border border-[#d4d4d4] bg-white px-4 py-1.5 text-[12.5px] font-medium text-[#111] transition-[border-color,background-color] duration-150 hover:border-[#111] disabled:cursor-not-allowed disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-[6px] border border-[#a01818] bg-white px-4 py-1.5 text-[12.5px] font-medium text-[#a01818] transition-colors duration-150 hover:bg-[#a01818] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent"
                  aria-hidden
                />
                {busyLabel}
              </span>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
