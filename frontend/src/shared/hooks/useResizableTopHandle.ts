import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 상단 핸들(헤더라인)을 잡아 위아래로 드래그해 본문 영역의 높이를 조절한다.
 *
 * 위로 드래그하면 본문이 커지고, 아래로 드래그하면 작아진다.
 * 패널이 화면 하단에 고정된(=top edge 가 곧 resize handle) 카드 UI에서 사용한다.
 *
 * - 초기값은 `viewportRatio` (기본 0.26 = 26vh) 로 마운트 시 1회 계산.
 * - 사용자가 직접 드래그해 조절한 값은 세션 동안 유지 (resize 이벤트로 viewport 가 변해도 절대 px 유지).
 * - min 80px / max 80% viewport 로 clamp.
 *
 * Pointer Events 기반 — touch / mouse / pen 모두 처리.
 */
export function useResizableTopHandle(options?: {
  initialViewportRatio?: number;
  minPx?: number;
  /** 0~1 범위. viewport 높이 대비 최대 비율. */
  maxRatio?: number;
}) {
  const initialRatio = options?.initialViewportRatio ?? 0.26;
  const minPx = options?.minPx ?? 80;
  const maxRatio = options?.maxRatio ?? 0.8;

  const [height, setHeight] = useState<number>(() => {
    if (typeof window === 'undefined') return 240;
    return Math.max(minPx, Math.round(window.innerHeight * initialRatio));
  });

  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      // 좌클릭 / 터치 / 펜만. 우클릭(2) 등은 무시.
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault();
      dragRef.current = { startY: e.clientY, startHeight: height };
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [height],
  );

  useEffect(() => {
    function onMove(ev: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      // 핸들이 본문 위쪽 경계라서, 위로 끌면(deltaY<0) 본문이 커진다.
      const delta = drag.startY - ev.clientY;
      const next = drag.startHeight + delta;
      const max = Math.round(window.innerHeight * maxRatio);
      setHeight(Math.min(max, Math.max(minPx, next)));
    }
    function onUp() {
      dragRef.current = null;
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [minPx, maxRatio]);

  return { height, onPointerDown };
}
