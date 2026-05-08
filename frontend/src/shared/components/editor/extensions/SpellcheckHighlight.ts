import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { useAiSessionStore, type SpellcheckIssue } from '../../../stores/aiSessionStore';

export interface SpellcheckHighlightStorage {
  /** 이 에디터 인스턴스가 담당하는 회차 id. ContentEditor 가 mount 시 세팅 */
  itemId: string;
  /** Store version 캐시 — 변경 감지용 */
  lastVersion: number;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    spellcheckHighlight: {
      triggerSpellcheckHighlightRebuild: () => ReturnType;
    };
  }
}

const spellcheckHighlightPluginKey = new PluginKey('spellcheckHighlight');

const SpellcheckHighlight = Extension.create<Record<string, never>, SpellcheckHighlightStorage>({
  name: 'spellcheckHighlight',

  addStorage() {
    return { itemId: '', lastVersion: -1 };
  },

  addCommands() {
    return {
      triggerSpellcheckHighlightRebuild:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(spellcheckHighlightPluginKey, true);
            dispatch(tr);
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const extensionStorage = this.storage;

    return [
      new Plugin({
        key: spellcheckHighlightPluginKey,

        state: {
          init() {
            return DecorationSet.empty;
          },

          apply(tr, oldDecoSet, _oldState, newState) {
            const store = useAiSessionStore.getState();
            const forceRebuild = tr.getMeta(spellcheckHighlightPluginKey);

            if (forceRebuild || tr.docChanged || store.spellcheckVersion !== extensionStorage.lastVersion) {
              extensionStorage.lastVersion = store.spellcheckVersion;
              return buildDecorations(newState.doc, extensionStorage, store);
            }

            return oldDecoSet;
          },
        },

        props: {
          decorations(state) {
            return this.getState(state) ?? DecorationSet.empty;
          },
        },
      }),
    ];

    function buildDecorations(
      doc: import('@tiptap/pm/model').Node,
      storage: SpellcheckHighlightStorage,
      store: ReturnType<typeof useAiSessionStore.getState>,
    ): DecorationSet {
      // 이 에디터가 spellcheck 대상 회차가 아니면 하이라이트 표시하지 않음
      const target = store.spellcheckTargetEpisode;
      if (!target || target.id !== storage.itemId) return DecorationSet.empty;

      const result = store.spellcheckResult;
      if (!result || result.issues.length === 0) return DecorationSet.empty;

      const applied = new Set(store.spellcheckAppliedIssues);
      const hovered = store.spellcheckHoveredIssue;
      const decorations: Decoration[] = [];

      const selectionRange = store.spellcheckSelectionRange;

      result.issues.forEach((issue, i) => {
        if (applied.has(i)) return;
        const range = selectionRange
          ? findInRange(doc, selectionRange, issue.original)
          : findIssueRange(doc, issue);
        if (!range) return;

        const classes = ['spellcheck-issue', `spellcheck-issue-${issue.type}`];
        if (hovered === i) classes.push('spellcheck-issue-hovered');

        decorations.push(
          Decoration.inline(range.from, range.to, {
            class: classes.join(' '),
            'data-spellcheck-index': String(i),
          }),
        );
      });

      if (decorations.length === 0) return DecorationSet.empty;
      return DecorationSet.create(doc, decorations);
    }

    function findInRange(
      doc: import('@tiptap/pm/model').Node,
      range: { from: number; to: number },
      term: string,
    ): { from: number; to: number } | null {
      if (!term) return null;
      let result: { from: number; to: number } | null = null;
      doc.nodesBetween(range.from, range.to, (node, pos) => {
        if (result) return false;
        if (node.isText && node.text) {
          // node 의 doc 내 absolute 위치가 pos. range 와 교차하는 부분만 검색.
          const nodeStart = pos;
          const nodeEnd = pos + node.text.length;
          const sliceStart = Math.max(range.from, nodeStart) - nodeStart;
          const sliceEnd = Math.min(range.to, nodeEnd) - nodeStart;
          if (sliceStart >= sliceEnd) return;
          const slice = node.text.slice(sliceStart, sliceEnd);
          const idx = slice.indexOf(term);
          if (idx !== -1) {
            const from = nodeStart + sliceStart + idx;
            result = { from, to: from + term.length };
            return false;
          }
        }
      });
      return result;
    }

    function findIssueRange(
      doc: import('@tiptap/pm/model').Node,
      issue: SpellcheckIssue,
    ): { from: number; to: number } | null {
      let result: { from: number; to: number } | null = null;
      let lineCount = 0;

      doc.forEach((blockNode, blockOffset) => {
        lineCount++;
        if (lineCount !== issue.line || result) return;
        blockNode.descendants((node, posInBlock) => {
          if (result) return false;
          if (node.isText && node.text) {
            const idx = node.text.indexOf(issue.original);
            if (idx !== -1) {
              const from = blockOffset + 1 + posInBlock + idx;
              result = { from, to: from + issue.original.length };
              return false;
            }
          }
        });
      });

      return result;
    }
  },
});

export default SpellcheckHighlight;
