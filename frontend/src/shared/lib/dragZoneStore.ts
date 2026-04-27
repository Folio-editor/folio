import { create } from 'zustand';

export type DragZone = 'before' | 'merge' | 'after';

interface DragZoneState {
  overId: string | null;
  zone: DragZone | null;
  set: (overId: string | null, zone: DragZone | null) => void;
  clear: () => void;
}

/**
 * 트리 드래그 중 현재 over 노드 + zone 추적.
 * - AuthenticatedApp의 DndContext.onDragMove에서 set
 * - 각 트리 노드가 자신의 over+zone 여부를 구독해 시각 피드백
 * - onDragEnd 후 clear
 */
export const useDragZoneStore = create<DragZoneState>((set) => ({
  overId: null,
  zone: null,
  set: (overId, zone) => set({ overId, zone }),
  clear: () => set({ overId: null, zone: null }),
}));
