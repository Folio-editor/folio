// ============================================================
// CustomHighlight — TipTap Highlight extension 의 inline style 제거 변형
// ============================================================
//
// 문제:
//   기본 @tiptap/extension-highlight 의 multicolor 모드는 setHighlight({color}) 호출 시
//   <mark data-color="yellow" style="background-color: yellow; color: inherit"> 처럼
//   inline style 로 background-color 를 직접 박는다.
//   - 'yellow' 같은 CSS 색명이 그대로 들어가 표준 노랑(#FFFF00)으로 렌더되거나
//   - 우리 디자인 토큰(--editor-mark-yellow) 이 다크모드에서 다른 색이어도 inline style 우선이라 적용 X.
//
// 해결:
//   addAttributes 의 renderHTML 을 override 해 data-color attribute 만 출력. background-color 는
//   editor.css 의 selector 가 토큰(var(--editor-mark-*)) 으로 결정하도록 위임.
//   parseHTML 은 기존 동작 유지(과거 inline style 데이터 호환).
// ============================================================

import Highlight from '@tiptap/extension-highlight';

const CustomHighlight = Highlight.extend({
  addAttributes() {
    if (!this.options.multicolor) {
      return {};
    }
    return {
      color: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute('data-color') || element.style.backgroundColor || null,
        renderHTML: (attributes) => {
          if (!attributes.color) return {};
          // ★ inline style 제거 — CSS selector + 디자인 토큰이 색상 결정.
          return { 'data-color': attributes.color };
        },
      },
    };
  },
});

export default CustomHighlight;
