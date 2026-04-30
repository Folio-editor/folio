import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '../../lib/cn';

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
  /** 위치/크기 영속용 키 — 미지정 시 메모리 only */
  persistKey?: string;
  /** 초기 너비 (기본 480) */
  initialWidth?: number;
  /** 초기 높이 (기본 380) */
  initialHeight?: number;
  /** 카드 등장/소멸 시 시각적 출발점이 되는 트리거 버튼 (? 버튼) ref */
  originRef?: RefObject<HTMLElement | null>;
}

interface PersistedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Phase = 'closed' | 'entering' | 'idle' | 'exiting';

const MIN_W = 320;
const MIN_H = 240;
const DEFAULT_W = 480;
const DEFAULT_H = 380;
const EXIT_MS = 250;

function clampToViewport(rect: PersistedRect): PersistedRect {
  const w = Math.max(MIN_W, Math.min(rect.w, window.innerWidth - 16));
  const h = Math.max(MIN_H, Math.min(rect.h, window.innerHeight - 16));
  const x = Math.max(8, Math.min(rect.x, window.innerWidth - w - 8));
  const y = Math.max(8, Math.min(rect.y, window.innerHeight - h - 8));
  return { x, y, w, h };
}

function loadRect(key: string | undefined, w: number, h: number): PersistedRect {
  if (key) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PersistedRect>;
        if (
          typeof parsed.x === 'number' &&
          typeof parsed.y === 'number' &&
          typeof parsed.w === 'number' &&
          typeof parsed.h === 'number'
        ) {
          return clampToViewport({ x: parsed.x, y: parsed.y, w: parsed.w, h: parsed.h });
        }
      }
    } catch {
      // ignore corrupt JSON
    }
  }
  // 화면 중앙 기본 위치
  const cx = Math.max(8, (window.innerWidth - w) / 2);
  const cy = Math.max(8, (window.innerHeight - h) / 2);
  return { x: cx, y: cy, w, h };
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * 비차단형 플로팅 도움말 카드.
 * - 헤더 드래그로 자유 이동
 * - 우측 하단 핸들로 리사이즈 (최소 320×240)
 * - 페이지 ◀▶ 네비게이션
 * - 우상단 ✕ 닫기
 * - dim 오버레이 없음 → 카드 외부 메인 패널·사이드바 정상 조작 가능
 * - originRef 가 주어지면 ? 버튼 위치에서 등장/소멸 (Genie 효과)
 */
export function FloatingHelpCard({
  open,
  title,
  steps,
  onClose,
  persistKey,
  initialWidth = DEFAULT_W,
  initialHeight = DEFAULT_H,
  originRef,
}: FloatingHelpCardProps) {
  const [rect, setRect] = useState<PersistedRect | null>(null);
  const [originRect, setOriginRect] = useState<PersistedRect | null>(null);
  const [phase, setPhase] = useState<Phase>('closed');
  const [stepIdx, setStepIdx] = useState(0);
  const dragStateRef = useRef<{
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    startRect: PersistedRect;
  } | null>(null);
  const phaseTimerRef = useRef<number | null>(null);

  const reduced = useMemo(() => prefersReducedMotion(), []);

  const measureOrigin = useCallback((): PersistedRect | null => {
    const el = originRef?.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }, [originRef]);

  // open / close 트리거에 따른 phase 전환
  useLayoutEffect(() => {
    if (open) {
      if (phase === 'closed') {
        // 진입 — origin 측정 + rect 로드 + entering→idle
        setOriginRect(measureOrigin());
        setRect(loadRect(persistKey, initialWidth, initialHeight));
        setStepIdx(0);
        setPhase('entering');
        if (reduced) {
          setPhase('idle');
        } else {
          // 두 번의 rAF 후 idle 로 — 첫 commit(entering 스타일) 이후 두 번째 commit 에서 transition 트리거
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              setPhase('idle');
            });
          });
        }
      }
    } else {
      if (phase === 'entering' || phase === 'idle') {
        // 닫기 — 현재 origin 재측정 후 exiting
        setOriginRect(measureOrigin());
        setPhase('exiting');
        if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
        const ms = reduced ? 0 : EXIT_MS + 30;
        phaseTimerRef.current = window.setTimeout(() => setPhase('closed'), ms);
      }
    }
  }, [open, phase, persistKey, initialWidth, initialHeight, measureOrigin, reduced]);

  useEffect(() => {
    return () => {
      if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
    };
  }, []);

  // steps 배열이 바뀌면 stepIdx 가 범위를 초과할 수 있으므로 0 으로 리셋
  useEffect(() => {
    setStepIdx(0);
  }, [steps]);

  // 영속화 — rect 변경 시 localStorage 저장
  useEffect(() => {
    if (!persistKey || !rect || phase !== 'idle') return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(persistKey, JSON.stringify(rect));
      } catch {
        // ignore
      }
    }, 200);
    return () => clearTimeout(t);
  }, [rect, persistKey, phase]);

  // 윈도우 리사이즈 시 카드 viewport 안쪽으로 clamp
  useEffect(() => {
    if (phase === 'closed') return;
    const handler = () => {
      setRect((prev) => (prev ? clampToViewport(prev) : prev));
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [phase]);

  const startDrag = useCallback(
    (mode: 'move' | 'resize', e: ReactPointerEvent<HTMLElement>) => {
      if (!rect) return;
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragStateRef.current = {
        mode,
        startX: e.clientX,
        startY: e.clientY,
        startRect: { ...rect },
      };
    },
    [rect],
  );

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const ds = dragStateRef.current;
    if (!ds) return;
    const dx = e.clientX - ds.startX;
    const dy = e.clientY - ds.startY;
    if (ds.mode === 'move') {
      setRect(
        clampToViewport({
          x: ds.startRect.x + dx,
          y: ds.startRect.y + dy,
          w: ds.startRect.w,
          h: ds.startRect.h,
        }),
      );
    } else {
      setRect(
        clampToViewport({
          x: ds.startRect.x,
          y: ds.startRect.y,
          w: ds.startRect.w + dx,
          h: ds.startRect.h + dy,
        }),
      );
    }
  }, []);

  const onPointerUp = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (dragStateRef.current) {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      dragStateRef.current = null;
    }
  }, []);

  if (phase === 'closed' || !rect || steps.length === 0) return null;

  const safeIdx = Math.min(Math.max(0, stepIdx), steps.length - 1);
  const current = steps[safeIdx];
  if (!current) return null;
  const isFirst = safeIdx === 0;
  const isLast = safeIdx === steps.length - 1;

  // 동적 inline style — phase 와 originRect 에 따라 출발/도착 좌표 계산
  const computedStyle: CSSProperties = (() => {
    if ((phase === 'entering' || phase === 'exiting') && originRect) {
      // ? 버튼 위치/크기에서 시작 (entering) 또는 그 위치로 축소 (exiting)
      return {
        left: originRect.x,
        top: originRect.y,
        width: originRect.w,
        height: originRect.h,
        opacity: 0,
        transformOrigin: 'top left',
      };
    }
    if ((phase === 'entering' || phase === 'exiting') && !originRect) {
      // origin fallback — 단순 페이드만
      return {
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        opacity: 0,
      };
    }
    // idle — 정상 위치/크기/투명도
    return {
      left: rect.x,
      top: rect.y,
      width: rect.w,
      height: rect.h,
      opacity: 1,
    };
  })();

  const isAnimating = phase === 'entering' || phase === 'exiting';
  const isDragging = dragStateRef.current !== null;
  const transitionClass =
    !reduced && isAnimating && !isDragging
      ? phase === 'entering'
        ? 'transition-all duration-300 ease-out'
        : 'transition-all duration-[250ms] ease-in'
      : 'transition-none';

  return (
    <div
      role="dialog"
      aria-label={`${title} 도움말`}
      aria-modal="false"
      style={computedStyle}
      className={cn(
        'fixed z-40 flex flex-col rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl',
        'overflow-hidden',
        transitionClass,
      )}
    >
      {/* 헤더 — 드래그 영역 + 페이지 표시 + 닫기 */}
      <div
        className="flex shrink-0 cursor-move select-none items-center gap-2 border-b border-border bg-muted/40 px-3 py-2"
        onPointerDown={(e) => startDrag('move', e)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-foreground">{title}</div>
          <div className="text-[10px] text-muted-foreground">
            도움말 · {safeIdx + 1} / {steps.length}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="도움말 닫기"
          className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>

      {/* 본문 — 스크롤 가능 */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <h3 className="mb-2 text-sm font-semibold text-foreground">{current.title}</h3>
        <div className="text-xs leading-relaxed text-foreground/85">{current.body}</div>
      </div>

      {/* 풋터 — 페이지 네비게이션 */}
      <div className="flex shrink-0 items-center justify-between border-t border-border bg-muted/30 px-3 py-2">
        <button
          type="button"
          onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
          disabled={isFirst}
          className={cn(
            'flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors',
            isFirst
              ? 'cursor-default text-muted-foreground/50'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
          )}
        >
          <ChevronLeft size={12} strokeWidth={2} />
          이전
        </button>

        {/* 진행 점 */}
        <div className="flex items-center gap-1">
          {steps.map((_, i) => (
            <span
              key={i}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === safeIdx ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/30',
              )}
            />
          ))}
        </div>

        {isLast ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            완료
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setStepIdx((i) => Math.min(steps.length - 1, i + 1))}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            다음
            <ChevronRight size={12} strokeWidth={2} />
          </button>
        )}
      </div>

      {/* 우측 하단 리사이즈 핸들 */}
      <div
        role="separator"
        aria-label="크기 조절"
        onPointerDown={(e) => startDrag('resize', e)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
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
