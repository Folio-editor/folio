import { useEffect, type RefObject } from 'react';

/**
 * 세로 휠(deltaY) → 가로 스크롤 매핑.
 *
 * 마우스 휠은 deltaY 만 발생하므로 가로 스크롤 컨테이너에서는 그대로면 페이지가 세로 스크롤되어
 * 사용성이 깨진다. 트랙패드 두 손가락 좌우 스와이프(deltaX 우세)는 native 처리.
 *
 * passive: false 로 등록해야 preventDefault 동작 — React onWheel(passive) 로는 불가, 직접 등록.
 */
export function useHorizontalWheelScroll<T extends HTMLElement>(ref: RefObject<T | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [ref]);
}
