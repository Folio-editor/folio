import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { cn } from '../../lib/cn';

interface ResizeHandleProps {
  /** 핸들이 붙을 위치 — 부모의 `right` 또는 `left` 가장자리. */
  side: 'right' | 'left';
  /** 커서 이동량(px). `side === 'left'` 면 부호가 이미 반전되어 "너비 증가 = 양수"로 전달된다. */
  onResize: (deltaPx: number) => void;
  ariaLabel?: string;
}

/**
 * 사이드 패널의 가장자리에 붙는 1px 수직 드래그 핸들.
 * - 4px 히트 영역(`w-1`)으로 조준 편의 확보.
 * - Hover/Active 시 내부 1px 라인이 `bg-blue-400` 로 가시화.
 * - `setPointerCapture` 로 드래그 중 커서가 창 밖으로 나가도 추적 유지.
 * - 드래그 중 `document.body` 의 `user-select` / `cursor` 를 강제로 바꿔 텍스트 선택·깜빡임 방지.
 */
export function ResizeHandle({ side, onResize, ariaLabel }: ResizeHandleProps) {
  const draggingRef = useRef(false);
  const lastXRef = useRef(0);

  const beginDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    draggingRef.current = true;
    lastXRef.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  };

  const updateDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const rawDelta = e.clientX - lastXRef.current;
    lastXRef.current = e.clientX;
    // 좌측 엣지 핸들: 왼쪽 이동(음수)이 "너비 증가"이므로 부호 반전해서 넘긴다.
    onResize(side === 'right' ? rawDelta : -rawDelta);
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      onPointerDown={beginDrag}
      onPointerMove={updateDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={cn(
        'group absolute bottom-0 top-0 z-10 w-1 cursor-col-resize select-none',
        side === 'right' ? '-right-0.5' : '-left-0.5',
      )}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover:bg-blue-400 group-active:bg-blue-500"
      />
    </div>
  );
}
