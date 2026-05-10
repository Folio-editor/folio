import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { cn } from '../../lib/cn';
import { useDraggableRect } from '../../hooks/useDraggableRect';
import {
  FONT_SERIF,
  MODAL_SHADOW,
  ORIGIN_ENTER_MS,
  ORIGIN_EXIT_MS,
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
  /**
   * 카드 등장/소멸 시 시각적 출발·도착점이 되는 트리거 버튼(? 아이콘)의 ref.
   * 지정되면 macOS 의 Genie 효과처럼 ? 버튼 위치에서 펼쳐지고, 닫을 때
   * 다시 그 위치로 축소되며 사라진다.
   */
  originRef?: RefObject<HTMLElement | null>;
  /** 초기 너비 (기본 440) */
  initialWidth?: number;
  /** 초기 높이 (기본 480) */
  initialHeight?: number;
}

interface OriginRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Phase = 'closed' | 'entering' | 'idle' | 'exiting';

const DEFAULT_W = 440;
const DEFAULT_H = 480;
const MIN_W = 380;
const MIN_H = 320;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * 탭별 컨텍스트 도움말 — 비차단형 플로팅 카드.
 * 헤더 드래그로 자유 이동, 우하단 그립으로 리사이즈, 위치/크기는 localStorage 영속.
 * originRef 가 지정되면 ? 버튼에서 펼쳐지고 다시 그 위치로 축소되며 사라지는
 * Genie 효과를 적용한다 (macOS 스타일). 디자인 토큰은 다른 Folio 모달과 공통이며
 * 라이트/다크 테마에 자동으로 반응한다.
 */
export function FloatingHelpCard({
  open,
  title,
  steps,
  onClose,
  persistKey,
  originRef,
  initialWidth = DEFAULT_W,
  initialHeight = DEFAULT_H,
}: FloatingHelpCardProps) {
  const [stepIdx, setStepIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('closed');
  const [originRect, setOriginRect] = useState<OriginRect | null>(null);
  const phaseTimerRef = useRef<number | null>(null);

  const reduced = useMemo(() => prefersReducedMotion(), []);

  // useDraggableRect 는 phase !== 'closed' 동안 활성화되어야 한다.
  const drag = useDraggableRect({
    active: phase !== 'closed',
    initialWidth,
    initialHeight,
    minWidth: MIN_W,
    minHeight: MIN_H,
    persistKey,
  });

  const measureOrigin = useCallback((): OriginRect | null => {
    const el = originRef?.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }, [originRef]);

  // open / close 트리거에 따른 phase 전환 (Genie 진입/소멸)
  useLayoutEffect(() => {
    if (open) {
      if (phase === 'closed') {
        setOriginRect(measureOrigin());
        setStepIdx(0);
        setPhase('entering');
        if (reduced) {
          setPhase('idle');
        } else {
          // 두 번의 rAF 후 idle 로 — 첫 commit 에서 origin 위치 적용,
          // 두 번째 commit 에서 transition 트리거.
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              setPhase('idle');
            });
          });
        }
      }
    } else {
      if (phase === 'entering' || phase === 'idle') {
        setOriginRect(measureOrigin());
        setPhase('exiting');
        if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
        const ms = reduced ? 0 : ORIGIN_EXIT_MS + 30;
        phaseTimerRef.current = window.setTimeout(
          () => setPhase('closed'),
          ms,
        );
      }
    }
  }, [open, phase, measureOrigin, reduced]);

  useEffect(
    () => () => {
      if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (phase !== 'idle') return;
    setStepIdx(0);
  }, [phase, steps]);

  useEffect(() => {
    if (phase !== 'idle') return;
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
  }, [phase, onClose, steps.length]);

  if (phase === 'closed' || !drag.rect || steps.length === 0) return null;
  const safeIdx = Math.min(Math.max(0, stepIdx), steps.length - 1);
  const current = steps[safeIdx];
  if (!current) return null;
  const isFirst = safeIdx === 0;
  const isLast = safeIdx === steps.length - 1;

  // entering / exiting 단계에서는 origin (? 버튼) 위치/크기로 출발·축소.
  // idle 단계에서는 드래그 가능한 정상 위치/크기.
  const animating = phase === 'entering' || phase === 'exiting';
  const computedStyle: CSSProperties = (() => {
    if (animating && originRect) {
      return {
        left: originRect.x,
        top: originRect.y,
        width: originRect.w,
        height: originRect.h,
        opacity: 0,
      };
    }
    if (animating && !originRect) {
      return {
        left: drag.rect.x,
        top: drag.rect.y,
        width: drag.rect.w,
        height: drag.rect.h,
        opacity: 0,
      };
    }
    return {
      left: drag.rect.x,
      top: drag.rect.y,
      width: drag.rect.w,
      height: drag.rect.h,
      opacity: 1,
    };
  })();

  const transitionStyle: CSSProperties =
    !reduced && animating && !drag.isDragging
      ? {
          transition: `left ${
            phase === 'entering' ? ORIGIN_ENTER_MS : ORIGIN_EXIT_MS
          }ms cubic-bezier(0.2,0.7,0.2,1), top ${
            phase === 'entering' ? ORIGIN_ENTER_MS : ORIGIN_EXIT_MS
          }ms cubic-bezier(0.2,0.7,0.2,1), width ${
            phase === 'entering' ? ORIGIN_ENTER_MS : ORIGIN_EXIT_MS
          }ms cubic-bezier(0.2,0.7,0.2,1), height ${
            phase === 'entering' ? ORIGIN_ENTER_MS : ORIGIN_EXIT_MS
          }ms cubic-bezier(0.2,0.7,0.2,1), opacity ${
            phase === 'entering' ? ORIGIN_ENTER_MS : ORIGIN_EXIT_MS
          }ms ease-out`,
        }
      : { transition: 'none' };

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="folio-help-title"
      data-folio-dialog
      className="fixed z-40 flex flex-col rounded-[12px] border border-border bg-popover text-popover-foreground overflow-hidden"
      style={{
        ...computedStyle,
        ...transitionStyle,
        boxShadow: MODAL_SHADOW,
      }}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerUp}
    >
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          [data-folio-dialog] { animation: none !important; transition: none !important; }
        }
      `}</style>

      {/* Header — 드래그 영역 */}
      <div
        className="flex items-start justify-between gap-3 px-7 pt-6 pb-3 cursor-move select-none shrink-0"
        onPointerDown={drag.startMove}
      >
        <div className="flex-1 min-w-0">
          <div
            aria-hidden
            className="mb-2 h-px w-7 bg-foreground opacity-45"
          />
          <div className="mb-1 text-[10.5px] tracking-[0.32em] uppercase text-muted-foreground">
            도움말 · {String(safeIdx + 1).padStart(2, '0')} /{' '}
            {String(steps.length).padStart(2, '0')}
          </div>
          <h2
            id="folio-help-title"
            className="m-0 text-[18px] font-semibold leading-[1.35] tracking-[-0.015em] text-popover-foreground truncate"
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
          className="ml-1 mt-1 px-1.5 py-1 text-[11px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-popover-foreground"
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
          className="m-0 mb-2.5 text-[16px] font-semibold leading-[1.4] tracking-[-0.01em] text-popover-foreground"
          style={{ fontFamily: FONT_SERIF }}
        >
          {current.title}
        </h3>
        <div className="text-[12.5px] leading-[1.75] text-popover-foreground [&_p]:m-0 [&_p+*]:mt-2.5 [&_*+p]:mt-2.5">
          {current.body}
        </div>
      </div>

      {/* Footer */}
      <div className="px-7 py-3 border-t border-border/60 flex items-center justify-between gap-3 shrink-0">
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
          disabled={isFirst}
          className={cn(
            'inline-flex items-center gap-1 bg-transparent border-0 cursor-pointer px-1 py-1 text-[12px] font-medium transition-colors',
            isFirst
              ? 'text-muted-foreground/50 cursor-default'
              : 'text-muted-foreground hover:text-popover-foreground',
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
                i === safeIdx
                  ? 'w-4 bg-foreground rounded-[1px]'
                  : 'w-1 bg-muted-foreground/40 rounded-full',
              )}
            />
          ))}
        </div>

        {isLast ? (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onClose}
            className="rounded-[6px] border border-border bg-card px-4 py-1 text-[12px] font-medium text-popover-foreground transition-[border-color] duration-150 hover:border-foreground"
          >
            완료
          </button>
        ) : (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() =>
              setStepIdx((i) => Math.min(steps.length - 1, i + 1))
            }
            className="inline-flex items-center gap-1 bg-transparent border-0 cursor-pointer px-1 py-1 text-[12px] font-medium text-popover-foreground transition-colors hover:text-foreground"
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
            'linear-gradient(135deg, transparent 50%, var(--muted-foreground) 50%, var(--muted-foreground) 60%, transparent 60%, transparent 70%, var(--muted-foreground) 70%, var(--muted-foreground) 80%, transparent 80%)',
          opacity: 0.4,
        }}
      />
    </div>
  );
}
