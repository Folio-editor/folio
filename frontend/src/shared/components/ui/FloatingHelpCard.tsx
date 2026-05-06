import {
  useEffect,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { cn } from '../../lib/cn';
import { useDraggableRect } from '../../hooks/useDraggableRect';
import {
  FONT_SERIF,
  MODAL_SHADOW,
  FADE_ANIMATION,
} from '../../constants/folioModalTokens';

export interface HelpStep {
  title: string;
  body: ReactNode;
}

interface FloatingHelpCardProps {
  open: boolean;
  /** 카드 헤더에 표시되는 탭 이름 (예: "회차 / 원고") */
  title: string;
  steps: HelpStep[];
  onClose: () => void;
  /** 위치/크기 영속화 키 */
  persistKey?: string;
  /** Deprecated — 이전 origin 효과 (현재는 무시) */
  originRef?: RefObject<HTMLElement | null>;
  /** 초기 너비 (기본 440) */
  initialWidth?: number;
  /** 초기 높이 (기본 480) */
  initialHeight?: number;
}

const DEFAULT_W = 440;
const DEFAULT_H = 480;
const MIN_W = 380;
const MIN_H = 320;

/**
 * 탭별 컨텍스트 도움말 — 비차단형 플로팅 카드.
 * 헤더 드래그로 자유 이동, 우하단 그립으로 리사이즈, 위치/크기는 localStorage 영속.
 * 디자인 토큰은 Folio 모달과 동일 (paper bg + ink-border + 서리프 타이틀 + "닫기 ✕").
 */
export function FloatingHelpCard({
  open,
  title,
  steps,
  onClose,
  persistKey,
  initialWidth = DEFAULT_W,
  initialHeight = DEFAULT_H,
}: FloatingHelpCardProps) {
  const [stepIdx, setStepIdx] = useState(0);
  const drag = useDraggableRect({
    active: open,
    initialWidth,
    initialHeight,
    minWidth: MIN_W,
    minHeight: MIN_H,
    persistKey,
  });

  useEffect(() => {
    if (!open) return;
    setStepIdx(0);
  }, [open, steps]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setStepIdx((i) => Math.max(0, i - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setStepIdx((i) => Math.min(steps.length - 1, i + 1));
      } else if (e.key === '1') {
        e.preventDefault();
        setStepIdx(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setStepIdx(steps.length - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, steps.length]);

  if (!open || !drag.rect || steps.length === 0) return null;
  const safeIdx = Math.min(Math.max(0, stepIdx), steps.length - 1);
  const current = steps[safeIdx];
  if (!current) return null;
  const isFirst = safeIdx === 0;
  const isLast = safeIdx === steps.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="folio-help-title"
      data-folio-dialog
      className="fixed z-40 flex flex-col rounded-[12px] border border-[#d4d4d4] bg-[#fafaf7] text-[#111] overflow-hidden"
      style={{
        left: drag.rect.x,
        top: drag.rect.y,
        width: drag.rect.w,
        height: drag.rect.h,
        boxShadow: MODAL_SHADOW,
        animation: FADE_ANIMATION,
      }}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerUp}
    >
      <style>{`
        @keyframes folioDialogFade {
          from { opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-folio-dialog] { animation: none !important; }
        }
      `}</style>

      {/* Header — 드래그 영역 */}
      <div
        className="flex items-start justify-between gap-3 px-7 pt-6 pb-3 cursor-move select-none flex-shrink-0"
        onPointerDown={drag.startMove}
      >
        <div className="flex-1 min-w-0">
          <div aria-hidden className="mb-2 h-px w-7 bg-[#111] opacity-45" />
          <div className="mb-1 text-[10.5px] tracking-[0.32em] uppercase text-[#6b6b6b]">
            도움말 · {String(safeIdx + 1).padStart(2, '0')} / {String(steps.length).padStart(2, '0')}
          </div>
          <h2
            id="folio-help-title"
            className="m-0 text-[18px] font-semibold leading-[1.35] tracking-[-0.015em] text-[#111] truncate"
            style={{ fontFamily: FONT_SERIF }}
          >
            {title}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label="닫기"
          className="ml-1 mt-1 px-1.5 py-1 text-[11px] uppercase tracking-[0.2em] text-[#6b6b6b] transition-colors hover:text-[#111]"
        >
          닫기 ✕
        </button>
      </div>

      {/* Body */}
      <div
        className="flex-1 overflow-y-auto px-7 pt-1 pb-3"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <h3
          className="m-0 mb-2.5 text-[16px] font-semibold leading-[1.4] tracking-[-0.01em] text-[#111]"
          style={{ fontFamily: FONT_SERIF }}
        >
          {current.title}
        </h3>
        <div className="text-[12.5px] leading-[1.75] text-[#111] [&_p]:m-0 [&_p+*]:mt-2.5 [&_*+p]:mt-2.5">
          {current.body}
        </div>
      </div>

      {/* Footer */}
      <div className="px-7 py-3 border-t border-[#e5e5e2] flex items-center justify-between gap-3 flex-shrink-0">
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
          disabled={isFirst}
          className={cn(
            'inline-flex items-center gap-1 bg-transparent border-0 cursor-pointer px-1 py-1 text-[12px] font-medium transition-colors',
            isFirst ? 'text-[#b4b4b4] cursor-default' : 'text-[#6b6b6b] hover:text-[#111]',
          )}
        >
          <span aria-hidden>←</span> 이전
        </button>

        <div className="inline-flex items-center gap-1.5" aria-hidden>
          {steps.map((_, i) => (
            <span
              key={i}
              className={cn(
                'h-1 transition-all duration-200',
                i === safeIdx ? 'w-4 bg-[#111] rounded-[1px]' : 'w-1 bg-[#b4b4b4] rounded-full',
              )}
            />
          ))}
        </div>

        {isLast ? (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onClose}
            className="rounded-[6px] border border-[#d4d4d4] bg-white px-4 py-1 text-[12px] font-medium text-[#111] transition-[border-color] duration-150 hover:border-[#111]"
          >
            완료
          </button>
        ) : (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setStepIdx((i) => Math.min(steps.length - 1, i + 1))}
            className="inline-flex items-center gap-1 bg-transparent border-0 cursor-pointer px-1 py-1 text-[12px] font-medium text-[#111] transition-colors hover:text-[#111]"
          >
            다음 <span aria-hidden>→</span>
          </button>
        )}
      </div>

      {/* Resize grip */}
      <div
        role="separator"
        aria-label="크기 조절"
        onPointerDown={drag.startResize}
        className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
        style={{
          background:
            'linear-gradient(135deg, transparent 50%, #6b6b6b 50%, #6b6b6b 60%, transparent 60%, transparent 70%, #6b6b6b 70%, #6b6b6b 80%, transparent 80%)',
          opacity: 0.35,
        }}
      />
    </div>
  );
}
