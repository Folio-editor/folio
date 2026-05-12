/**
 * 문학 표기 자동 하이라이트 — 대사 / 내면 묘사 표시.
 *
 * 동작:
 *   - 큰따옴표 ("...", "...", "...") → 대사 — `.dialogue` 클래스 부착
 *   - 작은따옴표 ('...', '...', '...') → 내면 묘사 — `.inner-thought` 클래스 부착
 *
 * 구현: ProseMirror Decoration (display-only). 실제 doc 내용 변경 X — 토글 ON/OFF 즉시 반영,
 * 저장/PowerSync 영향 없음. text node 들을 순회하며 정규식 매칭 위치에 inline decoration 부착.
 *
 * 옵션:
 *   - dialogueEnabled  : 대사 색상 ON/OFF
 *   - innerThoughtEnabled : 내면 묘사 색상 ON/OFF
 *
 * 실제 색상은 styles/editor.css 의 `.folio-editor .dialogue` / `.folio-editor .inner-thought`
 * (tokens.css 의 --editor-dialogue / --editor-inner-thought 토큰 참조).
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorState } from '@tiptap/pm/state';
import type { Node as ProseNode } from '@tiptap/pm/model';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface LiteraryHighlightOptions {
  dialogueEnabled: boolean;
  innerThoughtEnabled: boolean;
}

// 큰따옴표 — ASCII " ... ", 영문 curly " ... ", 한국어 ｟…｠ 류 (자주 쓰는 매핑만).
// 줄바꿈 포함 X — 한 줄 안에서만 매칭 (저자가 의도 안 한 광범위 wrap 방지).
const DIALOGUE_REGEX = /(?:"([^"\n]+)"|“([^“”\n]+)”|「([^「」\n]+)」)/g;

// 작은따옴표 — ASCII ' ... ', 영문 curly ' ... '.
const INNER_THOUGHT_REGEX = /(?:'([^'\n]+)'|‘([^‘’\n]+)’)/g;

function buildDecorations(doc: ProseNode, options: LiteraryHighlightOptions): DecorationSet {
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const text = node.text;

    if (options.dialogueEnabled) {
      for (const match of text.matchAll(DIALOGUE_REGEX)) {
        const start = pos + (match.index ?? 0);
        const end = start + match[0].length;
        decorations.push(Decoration.inline(start, end, { class: 'dialogue' }));
      }
    }

    if (options.innerThoughtEnabled) {
      for (const match of text.matchAll(INNER_THOUGHT_REGEX)) {
        const start = pos + (match.index ?? 0);
        const end = start + match[0].length;
        decorations.push(Decoration.inline(start, end, { class: 'inner-thought' }));
      }
    }
  });

  return DecorationSet.create(doc, decorations);
}

const literaryHighlightKey = new PluginKey<DecorationSet>('literaryHighlight');

export const LiteraryHighlight = Extension.create<LiteraryHighlightOptions>({
  name: 'literaryHighlight',

  addOptions() {
    return {
      dialogueEnabled: true,
      innerThoughtEnabled: true,
    };
  },

  addProseMirrorPlugins() {
    const extension = this;
    return [
      new Plugin<DecorationSet>({
        key: literaryHighlightKey,
        state: {
          init: (_, state) => buildDecorations(state.doc, extension.options),
          apply: (tr, oldSet, _oldState, newState) => {
            // doc 변경 시에만 재계산. 단순 selection 변경엔 기존 set 위치 매핑.
            if (!tr.docChanged) return oldSet.map(tr.mapping, tr.doc);
            return buildDecorations(newState.doc, extension.options);
          },
        },
        props: {
          decorations(state: EditorState) {
            return literaryHighlightKey.getState(state);
          },
        },
      }),
    ];
  },
});
