// ============================================================
// focusedEditorStore — 현재 포커스된 TipTap editor 인스턴스 추적 (memory only)
// ============================================================
// 다중 에디터 화면(WorldNote hierarchy / Character·Plot 통합뷰)에서 UnifiedEditorToolbar(mode='shared')가
// 어느 에디터에 명령을 보낼지 결정하기 위한 레지스트리.
//
// - inline 에디터가 onFocus 시 focusEditor(self) 호출
// - onBlur / 언마운트 시 blurEditor(self) 호출 (자기 자신만 해제 가능)
// - 한 에디터 → 다른 에디터로 cursor 이동 시 prev.onBlur가 new.onFocus 후에
//   호출되더라도 자기 자신만 해제하므로 누락 없음
// ============================================================

import type { Editor } from '@tiptap/react';
import { create } from 'zustand';

interface FocusedEditorState {
  editor: Editor | null;
  focusEditor: (e: Editor) => void;
  /** 자기 자신이 등록한 editor만 비움 — 다른 editor가 이미 점유 중이면 no-op */
  blurEditor: (e: Editor) => void;
}

export const useFocusedEditorStore = create<FocusedEditorState>((set, getState) => ({
  editor: null,
  focusEditor: (e) => {
    if (getState().editor !== e) set({ editor: e });
  },
  blurEditor: (e) => {
    if (getState().editor === e) set({ editor: null });
  },
}));

/** 단일 selector — UI 컴포넌트용 */
export function useFocusedEditor(): Editor | null {
  return useFocusedEditorStore((s) => s.editor);
}
