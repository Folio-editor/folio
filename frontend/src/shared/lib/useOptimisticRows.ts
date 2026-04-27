import { useMemo } from 'react';
import { useOptimisticMoveStore } from './optimisticMoveStore';

export interface RowLike {
  id: string;
  sort_order?: number | null;
  parent_id?: string | null;
  character_id?: string;
  work_id?: string;
}

export interface OptimisticContext {
  /** docType — store의 move.docType과 매칭 */
  docType: string;
  /** world_note/plot 자식 query의 부모 id (root는 null). 평탄 리스트에선 undefined */
  parentId?: string | null;
  /** character_note query의 character_id */
  characterId?: string;
  /** 평탄 리스트의 work_id (디버그용 — match 함수와 일관성) */
  workId?: string;
  /**
   * 가짜 row 삽입 가부 결정 — caller가 SQL의 WHERE 조건을 함수로 표현.
   * 예: plan_note는 (row) => row.work_id === workId
   * 예: world_note 자식은 (row) => row.parent_id === parentId
   */
  matches: (row: RowLike) => boolean;
}

/**
 * useQuery 결과에 optimistic store를 apply.
 *
 * 동작:
 * 1. pending move 중 docType 일치하는 것만 추출
 * 2. 옛 위치(현 ctx)에 있던 row 중 newParent/newCharacterId가 ctx와 다르면 제외
 * 3. 새로 들어오는 row 가짜 삽입 (snapshot 기반) — ctx.matches 통과 시
 * 4. 모든 row의 sort_order를 store 값으로 갱신 후 정렬
 *
 * store가 비어있으면 rows를 그대로 반환 (early return).
 */
export function useOptimisticRows<T extends RowLike>(
  rows: T[],
  ctx: OptimisticContext,
): T[] {
  const moves = useOptimisticMoveStore((s) => s.moves);
  return useMemo(() => {
    if (moves.size === 0) return rows;

    const relevant = Array.from(moves.values()).filter(
      (m) => m.docType === ctx.docType,
    );
    if (relevant.length === 0) return rows;

    // 1) 옛 위치에 있던 row가 새 그룹으로 빠져나갔으면 제외
    const filtered: T[] = rows.filter((row) => {
      const m = moves.get(row.id);
      if (!m) return true;
      // newParentId가 명시되어 있고 현재 ctx.parentId와 다르면 빠져나감
      if (m.newParentId !== undefined && m.newParentId !== ctx.parentId) {
        return false;
      }
      if (
        m.newCharacterId !== undefined &&
        m.newCharacterId !== ctx.characterId
      ) {
        return false;
      }
      return true;
    });

    // 2) 새로 들어오는 가짜 row 삽입
    for (const m of relevant) {
      if (filtered.some((r) => r.id === m.docId)) continue;
      // ctx와 매치되는 그룹에만 삽입
      if (m.newParentId !== undefined && m.newParentId !== ctx.parentId) continue;
      if (
        m.newCharacterId !== undefined &&
        m.newCharacterId !== ctx.characterId
      ) {
        continue;
      }
      const snapshot = m.rowSnapshot as unknown as RowLike;
      if (!ctx.matches(snapshot)) continue;
      filtered.push({
        ...(snapshot as unknown as T),
        sort_order: m.newSortOrder,
        parent_id: m.newParentId ?? null,
      });
    }

    // 3) sort_order를 store 값으로 갱신 + 재정렬
    return filtered
      .map((row) => {
        const m = moves.get(row.id);
        if (m) return { ...row, sort_order: m.newSortOrder };
        return row;
      })
      .sort(
        (a, b) =>
          (typeof a.sort_order === 'number' ? a.sort_order : 0) -
          (typeof b.sort_order === 'number' ? b.sort_order : 0),
      );
  }, [
    rows,
    moves,
    ctx.docType,
    ctx.parentId,
    ctx.characterId,
    ctx.workId,
    ctx.matches,
  ]);
}
