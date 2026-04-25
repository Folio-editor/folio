// ============================================================
// sidebarClickHandler — 사이드바 항목 클릭 의도 디스패처
// ============================================================
// Stage Manager 단순화 모델:
// - 단일 클릭 → 메인에 열기 ('default')
// - 더블 클릭 / ⌘·Ctrl+Click → 우측 핀 ('pin')
//
// onClick은 더블클릭 시 2회 발생 후 onDoubleClick 발생하므로,
// 단일 클릭 액션은 200ms 지연 → 그 사이 더블 들어오면 timeout 취소.
// 200ms는 OS 더블클릭 임계 아래로, 단일 클릭 반응성을 적당히 유지.
// ============================================================

import { useCallback, useEffect, useRef } from 'react';
import type { ClickIntent } from '../types/workspace';

const DOUBLE_CLICK_WINDOW_MS = 200;

/**
 * 사이드바 항목용 onClick/onDoubleClick 핸들러 페어 생성.
 *
 * @param onIntent — 결정된 의도(default/pin)에 따라 디스패치할 콜백
 * @returns 사이드바 행에 spread 가능한 { onClick, onDoubleClick }
 */
export function useSidebarClickHandler(
  onIntent: (intent: ClickIntent) => void,
) {
  const timerRef = useRef<number | null>(null);

  // 언마운트 시 보류 중인 timeout 정리 — 메모리 누수 방지
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      // ⌘/Ctrl+Click — 즉시 pin
      if (e.metaKey || e.ctrlKey) {
        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        onIntent('pin');
        return;
      }

      // 단일 — 200ms 지연 (그 사이 onDoubleClick이 오면 cancel)
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        onIntent('default');
      }, DOUBLE_CLICK_WINDOW_MS);
    },
    [onIntent],
  );

  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      // 보류된 단일 클릭 액션 취소
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      // 모디파이어 더블클릭은 onClick에서 이미 즉시 pin 처리됐으므로 재실행 X
      if (e.metaKey || e.ctrlKey) return;
      onIntent('pin');
    },
    [onIntent],
  );

  return { onClick, onDoubleClick };
}
