// ============================================================
// editorToolbarStore — 에디터 툴바 가시성 글로벌 prefs (zustand + localStorage 영속)
// ============================================================
// 모든 메인 편집 화면 헤더의 토글 버튼이 이 store를 단일 진실 소스로 사용.
// - true: 단일 에디터 화면(ContentEditor) 툴바 노출 + 다중 에디터 화면(WorldNote
//          hierarchy / AuxDocViewer) sticky SharedEditorToolbar 활성
// - false: 모든 컨텍스트에서 툴바 숨김 (단축키 전용 편집)
// 디폴트: true
// ============================================================

import { create } from 'zustand';

const STORAGE_KEY = 'folio.ui.editorToolbarVisible';

function load(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return true;
    return raw === '1';
  } catch {
    return true;
  }
}

function persist(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch {
    // ignore
  }
}

interface EditorToolbarState {
  visible: boolean;
  toggle: () => void;
  set: (v: boolean) => void;
}

export const useEditorToolbarStore = create<EditorToolbarState>((set, getState) => ({
  visible: load(),
  toggle: () => {
    const next = !getState().visible;
    persist(next);
    set({ visible: next });
  },
  set: (v) => {
    persist(v);
    set({ visible: v });
  },
}));

/** 호출처에서 selector 1개로 깔끔하게 — 리렌더 최소화 */
export function useEditorToolbarVisible(): boolean {
  return useEditorToolbarStore((s) => s.visible);
}
