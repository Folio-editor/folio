import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

export interface AutoPairQuotesOptions {
  enabled: boolean;
}

const QUOTE_PAIRS: Record<string, { open: string; close: string }> = {
  '"': { open: '\u201C', close: '\u201D' },
  "'": { open: '\u2018', close: '\u2019' },
};

const autoPairQuotesPluginKey = new PluginKey('autoPairQuotes');

const AutoPairQuotes = Extension.create<AutoPairQuotesOptions>({
  name: 'autoPairQuotes',

  addOptions() {
    return {
      enabled: true,
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;

    return [
      new Plugin({
        key: autoPairQuotesPluginKey,

        props: {
          handleKeyDown(view: EditorView, event: KeyboardEvent): boolean {
            if (!options.enabled) {
              return false;
            }

            const pair = QUOTE_PAIRS[event.key];
            if (!pair) {
              return false;
            }

            event.preventDefault();

            const { state, dispatch } = view;
            const { selection } = state;
            const { from, to, empty } = selection;

            // Case 1: Text is selected — wrap with quotes
            if (!empty) {
              const selectedText = state.doc.textBetween(from, to);
              const wrapped = `${pair.open}${selectedText}${pair.close}`;
              const tr = state.tr.replaceWith(
                from,
                to,
                state.schema.text(wrapped),
              );

              // Place cursor after closing quote
              tr.setSelection(
                TextSelection.near(tr.doc.resolve(from + wrapped.length)),
              );
              dispatch(tr);
              return true;
            }

            // Case 2: Cursor is right before a closing quote — skip over it
            const charAfter = state.doc.textBetween(
              from,
              Math.min(from + 1, state.doc.content.size),
              undefined,
              '\0',
            );
            if (charAfter === pair.close) {
              const tr = state.tr.setSelection(
                TextSelection.near(state.doc.resolve(from + 1)),
              );
              dispatch(tr);
              return true;
            }

            // Case 3: Insert pair and place cursor between
            const insertText = `${pair.open}${pair.close}`;
            const tr = state.tr.insertText(insertText, from);

            // Place cursor between the two quotes
            tr.setSelection(
              TextSelection.near(
                tr.doc.resolve(from + pair.open.length),
              ),
            );
            dispatch(tr);
            return true;
          },
        },
      }),
    ];
  },
});

export default AutoPairQuotes;
