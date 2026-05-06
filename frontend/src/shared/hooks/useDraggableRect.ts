import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

export interface DraggableRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface UseDraggableRectOptions {
  /** 활성화 여부 — false 면 hook 은 동작하지 않고 null 만 반환 */
  active: boolean;
  /** 초기 너비 */
  initialWidth: number;
  /** 초기 높이 */
  initialHeight: number;
  /** 최소 너비 */
  minWidth?: number;
  /** 최소 높이 */
  minHeight?: number;
  /** localStorage 영속화 키 — 미지정 시 메모리 only */
  persistKey?: string;
}

interface UseDraggableRectResult {
  rect: DraggableRect | null;
  startMove: (e: ReactPointerEvent<HTMLElement>) => void;
  startResize: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
  isDragging: boolean;
}

function clampToViewport(
  rect: DraggableRect,
  minW: number,
  minH: number,
): DraggableRect {
  const w = Math.max(minW, Math.min(rect.w, window.innerWidth - 16));
  const h = Math.max(minH, Math.min(rect.h, window.innerHeight - 16));
  const x = Math.max(8, Math.min(rect.x, window.innerWidth - w - 8));
  const y = Math.max(8, Math.min(rect.y, window.innerHeight - h - 8));
  return { x, y, w, h };
}

function loadInitialRect(
  key: string | undefined,
  w: number,
  h: number,
  minW: number,
  minH: number,
): DraggableRect {
  if (typeof window === 'undefined') return { x: 0, y: 0, w, h };
  if (key) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<DraggableRect>;
        if (
          typeof parsed.x === 'number' &&
          typeof parsed.y === 'number' &&
          typeof parsed.w === 'number' &&
          typeof parsed.h === 'number'
        ) {
          return clampToViewport(
            { x: parsed.x, y: parsed.y, w: parsed.w, h: parsed.h },
            minW,
            minH,
          );
        }
      }
    } catch {
      // ignore
    }
  }
  const cx = Math.max(8, (window.innerWidth - w) / 2);
  const cy = Math.max(8, (window.innerHeight - h) / 2);
  return { x: cx, y: cy, w, h };
}

/**
 * 모달/플로팅 카드의 위치+크기를 드래그/리사이즈 + localStorage 영속화로 관리한다.
 * 헤더에는 startMove, 우하단 그립에는 startResize 를 onPointerDown 으로 연결.
 * onPointerMove/onPointerUp 은 같은 element 에 함께 부착.
 */
export function useDraggableRect({
  active,
  initialWidth,
  initialHeight,
  minWidth = 360,
  minHeight = 240,
  persistKey,
}: UseDraggableRectOptions): UseDraggableRectResult {
  const [rect, setRect] = useState<DraggableRect | null>(null);
  const dragRef = useRef<{
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    startRect: DraggableRect;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // active=true 가 되는 순간 초기 위치 로드
  useEffect(() => {
    if (!active) {
      setRect(null);
      return;
    }
    setRect(
      loadInitialRect(persistKey, initialWidth, initialHeight, minWidth, minHeight),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // 영속화
  useEffect(() => {
    if (!persistKey || !rect || !active) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(persistKey, JSON.stringify(rect));
      } catch {
        // ignore
      }
    }, 200);
    return () => clearTimeout(t);
  }, [rect, persistKey, active]);

  // 윈도우 리사이즈 시 viewport 안쪽으로 clamp
  useEffect(() => {
    if (!active) return;
    const onResize = () => {
      setRect((prev) =>
        prev ? clampToViewport(prev, minWidth, minHeight) : prev,
      );
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [active, minWidth, minHeight]);

  const startDrag = useCallback(
    (mode: 'move' | 'resize', e: ReactPointerEvent<HTMLElement>) => {
      if (!rect) return;
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = {
        mode,
        startX: e.clientX,
        startY: e.clientY,
        startRect: { ...rect },
      };
      setIsDragging(true);
    },
    [rect],
  );

  const startMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => startDrag('move', e),
    [startDrag],
  );
  const startResize = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => startDrag('resize', e),
    [startDrag],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const ds = dragRef.current;
      if (!ds) return;
      const dx = e.clientX - ds.startX;
      const dy = e.clientY - ds.startY;
      if (ds.mode === 'move') {
        setRect(
          clampToViewport(
            {
              x: ds.startRect.x + dx,
              y: ds.startRect.y + dy,
              w: ds.startRect.w,
              h: ds.startRect.h,
            },
            minWidth,
            minHeight,
          ),
        );
      } else {
        setRect(
          clampToViewport(
            {
              x: ds.startRect.x,
              y: ds.startRect.y,
              w: ds.startRect.w + dx,
              h: ds.startRect.h + dy,
            },
            minWidth,
            minHeight,
          ),
        );
      }
    },
    [minWidth, minHeight],
  );

  const onPointerUp = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (dragRef.current) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore — pointer may already be released
      }
      dragRef.current = null;
      setIsDragging(false);
    }
  }, []);

  return { rect, startMove, startResize, onPointerMove, onPointerUp, isDragging };
}
