import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/**
 * 현재 매치 위치로 뷰포트를 스크롤한다.
 * Why: nextMatch/prevMatch 시 데코레이션만 갱신되면 사용자가 매치를 시각적으로 따라갈 수 없다.
 * 입력 박스에 포커스가 있는 상태에서 ProseMirror selection만 옮기므로 DOM focus는 유지된다.
 */
function scrollToCurrentMatch(
  tr: import('@tiptap/pm/state').Transaction,
  storage: FindReplaceStorage,
) {
  const { results, currentIndex } = storage;
  if (currentIndex < 0 || currentIndex >= results.length) return;
  const { from, to } = results[currentIndex];
  const docSize = tr.doc.content.size;
  if (from > docSize || to > docSize) return;
  tr.setSelection(TextSelection.create(tr.doc, from, to)).scrollIntoView();
}

export interface FindReplaceStorage {
  searchTerm: string;
  replaceTerm: string;
  results: { from: number; to: number }[];
  currentIndex: number;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    findReplace: {
      setSearchTerm: (term: string) => ReturnType;
      setReplaceTerm: (term: string) => ReturnType;
      nextMatch: () => ReturnType;
      prevMatch: () => ReturnType;
      replaceCurrentMatch: () => ReturnType;
      replaceAllMatches: () => ReturnType;
      clearSearch: () => ReturnType;
    };
  }
}

const findReplacePluginKey = new PluginKey('findReplace');

/**
 * Search through the document text and collect all positions where
 * `term` appears (case-insensitive).
 */
function findMatches(
  doc: import('@tiptap/pm/model').Node,
  term: string,
): { from: number; to: number }[] {
  if (!term) return [];

  const results: { from: number; to: number }[] = [];
  const lowerTerm = term.toLowerCase();

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;

    const text = node.text.toLowerCase();
    let index = text.indexOf(lowerTerm);

    while (index !== -1) {
      results.push({
        from: pos + index,
        to: pos + index + term.length,
      });
      index = text.indexOf(lowerTerm, index + 1);
    }
  });

  return results;
}

const FindReplace = Extension.create<Record<string, never>, FindReplaceStorage>(
  {
    name: 'findReplace',

    addStorage() {
      return {
        searchTerm: '',
        replaceTerm: '',
        results: [] as { from: number; to: number }[],
        currentIndex: -1,
      };
    },

    addCommands() {
      return {
        setSearchTerm:
          (term: string) =>
          ({ editor, tr, dispatch }) => {
            this.storage.searchTerm = term;
            const results = findMatches(tr.doc, term);
            this.storage.results = results;
            this.storage.currentIndex = results.length > 0 ? 0 : -1;

            if (dispatch) {
              // Force a transaction to trigger plugin decoration rebuild
              tr.setMeta(findReplacePluginKey, true);
              scrollToCurrentMatch(tr, this.storage);
              dispatch(tr);
            }

            return true;
          },

        setReplaceTerm:
          (term: string) =>
          () => {
            this.storage.replaceTerm = term;
            return true;
          },

        nextMatch:
          () =>
          ({ tr, dispatch }) => {
            const { results } = this.storage;
            if (results.length === 0) return false;

            this.storage.currentIndex =
              (this.storage.currentIndex + 1) % results.length;

            if (dispatch) {
              tr.setMeta(findReplacePluginKey, true);
              scrollToCurrentMatch(tr, this.storage);
              dispatch(tr);
            }

            return true;
          },

        prevMatch:
          () =>
          ({ tr, dispatch }) => {
            const { results } = this.storage;
            if (results.length === 0) return false;

            this.storage.currentIndex =
              (this.storage.currentIndex - 1 + results.length) %
              results.length;

            if (dispatch) {
              tr.setMeta(findReplacePluginKey, true);
              scrollToCurrentMatch(tr, this.storage);
              dispatch(tr);
            }

            return true;
          },

        replaceCurrentMatch:
          () =>
          ({ tr, dispatch }) => {
            const { results, currentIndex, replaceTerm } = this.storage;
            if (currentIndex < 0 || currentIndex >= results.length)
              return false;

            const { from, to } = results[currentIndex];

            if (dispatch) {
              tr.insertText(replaceTerm, from, to);
              dispatch(tr);
            }

            // Recompute results after replacement
            this.editor.commands.setSearchTerm(this.storage.searchTerm);

            return true;
          },

        replaceAllMatches:
          () =>
          ({ tr, dispatch }) => {
            const { results, replaceTerm } = this.storage;
            if (results.length === 0) return false;

            if (dispatch) {
              // Replace in reverse order so positions stay valid
              const sorted = [...results].sort((a, b) => b.from - a.from);

              for (const { from, to } of sorted) {
                tr.insertText(replaceTerm, from, to);
              }

              dispatch(tr);
            }

            // Recompute results after replacement
            this.editor.commands.setSearchTerm(this.storage.searchTerm);

            return true;
          },

        clearSearch:
          () =>
          ({ tr, dispatch }) => {
            this.storage.searchTerm = '';
            this.storage.replaceTerm = '';
            this.storage.results = [];
            this.storage.currentIndex = -1;

            if (dispatch) {
              tr.setMeta(findReplacePluginKey, true);
              dispatch(tr);
            }

            return true;
          },
      };
    },

    addKeyboardShortcuts() {
      return {
        'Mod-f': () => {
          // Prevent default browser find; UI layer handles opening search
          return true;
        },
        'Mod-h': () => {
          // Prevent default; UI layer handles opening search in replace mode
          return true;
        },
      };
    },

    addProseMirrorPlugins() {
      const extensionStorage = this.storage;

      return [
        new Plugin({
          key: findReplacePluginKey,

          state: {
            init() {
              return DecorationSet.empty;
            },

            apply(tr, oldDecoSet, _oldState, newState) {
              // Rebuild when we receive our meta signal or the doc changes
              if (
                tr.getMeta(findReplacePluginKey) ||
                tr.docChanged
              ) {
                return buildDecorations(newState.doc, extensionStorage);
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
        storage: FindReplaceStorage,
      ): DecorationSet {
        const { searchTerm, currentIndex } = storage;

        if (!searchTerm) return DecorationSet.empty;

        // Recompute results from the current doc state
        const results = findMatches(doc, searchTerm);
        storage.results = results;

        if (results.length === 0) {
          storage.currentIndex = -1;
          return DecorationSet.empty;
        }

        // Clamp currentIndex
        if (storage.currentIndex >= results.length) {
          storage.currentIndex = 0;
        }

        const decorations = results.map((match, i) =>
          Decoration.inline(match.from, match.to, {
            class:
              i === currentIndex ? 'find-match find-match-current' : 'find-match',
          }),
        );

        return DecorationSet.create(doc, decorations);
      }
    },
  },
);

export default FindReplace;
