import { useCallback } from 'react';
import { usePersistentState } from './usePersistentState';

type ExpandedMap = Record<string, boolean>;

/**
 * 세계관 통합 뷰의 하위 카드 접기/펴기 상태 영속화.
 * 상위별로 namespace 분리: `folio.ui.world-note.{parentId}.expanded`
 * - 기본값: 모든 child expanded=true
 * - 사용자가 접으면 false 저장
 */
export function useWorldNoteExpanded(parentId: string) {
  const [map, setMap] = usePersistentState<ExpandedMap>(
    `folio.ui.world-note.${parentId}.expanded`,
    {},
  );

  const isExpanded = useCallback(
    (childId: string) => map[childId] !== false,
    [map],
  );

  const toggle = useCallback(
    (childId: string) => {
      setMap((prev) => ({ ...prev, [childId]: !(prev[childId] !== false) }));
    },
    [setMap],
  );

  const setExpanded = useCallback(
    (childId: string, expanded: boolean) => {
      setMap((prev) => ({ ...prev, [childId]: expanded }));
    },
    [setMap],
  );

  return { isExpanded, toggle, setExpanded, map, setMap };
}
