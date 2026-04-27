import { create } from 'zustand';

/**
 * 드래그 드롭 중 발생한 이동을 즉시 UI에 반영하기 위한 pending 상태.
 * - drop 즉시 addMove(...) — 컴포넌트가 store apply로 새 위치 표시
 * - DB UPDATE 백그라운드 await 후 clearMove(...) — useQuery 결과로 자연 일치
 */
export interface OptimisticMove {
  docId: string;
  docType: string;
  /** floating point — UI ordering 결정용 (DB는 reindex로 정수) */
  newSortOrder: number;
  /** world_note / plot — parent 변경 시. 평탄 리스트에서는 undefined */
  newParentId?: string | null;
  /** character_note — characterId 그룹 변경 시 (현재 정책상 X, 안전망) */
  newCharacterId?: string;
  /**
   * 가짜 row 삽입을 위한 row 전체 snapshot.
   * cross-parent 시 새 부모의 useQuery 결과에 가짜 row 삽입에 사용.
   * 컴포넌트의 useSortable.data에 SELECT 필드 모두 실어야 함.
   */
  rowSnapshot: Record<string, unknown>;
}

interface OptimisticState {
  moves: Map<string, OptimisticMove>;
  addMove: (move: OptimisticMove) => void;
  clearMove: (docId: string) => void;
}

export const useOptimisticMoveStore = create<OptimisticState>((set) => ({
  moves: new Map(),
  addMove: (move) =>
    set((state) => {
      const next = new Map(state.moves);
      next.set(move.docId, move);
      return { moves: next };
    }),
  clearMove: (docId) =>
    set((state) => {
      if (!state.moves.has(docId)) return state;
      const next = new Map(state.moves);
      next.delete(docId);
      return { moves: next };
    }),
}));
