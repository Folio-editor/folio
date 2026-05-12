import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

import { useEditorSettings } from '../../../stores/editorSettingsStore';

export interface TypewriterModeOptions {
  /** 미사용 — 옵션 closure 캡처 회피 위해 zustand store 직접 구독.
   *  하위 호환성 위해 interface 만 유지. */
  enabled?: boolean;
  position?: number;
}

const typewriterModePluginKey = new PluginKey('typewriterMode');

/**
 * 타자기 모드 — cursor 가 항상 컨테이너의 같은 vertical position 에 머무르도록 자동 스크롤.
 *
 * ★ 구현 주의: Tiptap React 의 useEditor 는 deps 없이 1회만 초기화한다. 따라서 plugin 의
 *   addProseMirrorPlugins() 에서 받은 options 는 클로저로 캡처되어 설정 토글이 반영되지 않는다.
 *   해결: zustand store (useEditorSettings) 를 plugin view.update 안에서 매번 .getState() 로
 *   직접 읽어 latest 값을 사용.
 */
const TypewriterMode = Extension.create<TypewriterModeOptions>({
  name: 'typewriterMode',

  addOptions() {
    return {
      enabled: true,
      position: 50,
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: typewriterModePluginKey,

        view() {
          return {
            update(view: EditorView, prevState) {
              // ★ closure 캡처 회피 — 매 update 마다 zustand store 의 최신 설정 직접 조회.
              const { typewriterMode: enabled, typewriterPosition: position } =
                useEditorSettings.getState();
              if (!enabled) return;

              const { state } = view;
              // selection 변경 또는 doc 변경이 있을 때만 스크롤 조정
              if (
                prevState &&
                prevState.selection.eq(state.selection) &&
                prevState.doc.eq(state.doc)
              ) {
                return;
              }

              const { from } = state.selection;

              try {
                const coords = view.coordsAtPos(from);
                // 스크롤 컨테이너 — .ProseMirror 의 가장 가까운 overflow-y 영역.
                // 우리 ContentEditor 구조: <div overflow-y-auto> > <div absolute inset-0> > .ProseMirror
                // 또는 <div overflow-y-auto> > .ProseMirror.
                // closest 로 직접 overflow-y-auto 컨테이너 탐색.
                let scrollContainer: HTMLElement | null = view.dom.parentElement;
                while (scrollContainer) {
                  const style = window.getComputedStyle(scrollContainer);
                  if (
                    style.overflowY === 'auto' ||
                    style.overflowY === 'scroll'
                  ) {
                    break;
                  }
                  scrollContainer = scrollContainer.parentElement;
                }
                if (!scrollContainer) return;

                const containerRect = scrollContainer.getBoundingClientRect();
                const targetY =
                  containerRect.top + (containerRect.height * position) / 100;
                const offset = coords.top - targetY;
                // 1px 미만 미세 변동은 무시 — smooth 스크롤 누적 떨림 방지
                if (Math.abs(offset) < 1) return;

                scrollContainer.scrollBy({
                  top: offset,
                  behavior: 'smooth',
                });
              } catch {
                // coordsAtPos 가 viewport 밖이면 throw — 무시
              }
            },
          };
        },
      }),
    ];
  },
});

export default TypewriterMode;
