import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

export interface TypewriterModeOptions {
  enabled: boolean;
  /** Cursor position as a percentage from the top of the container (0-100). */
  position: number;
}

const typewriterModePluginKey = new PluginKey('typewriterMode');

const TypewriterMode = Extension.create<TypewriterModeOptions>({
  name: 'typewriterMode',

  addOptions() {
    return {
      enabled: true,
      position: 50,
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;

    return [
      new Plugin({
        key: typewriterModePluginKey,

        view() {
          return {
            update(view: EditorView, prevState) {
              if (!options.enabled) {
                return;
              }

              // Only act when the cursor position has changed
              const { state } = view;
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
                const editorDOM = view.dom.closest('.ProseMirror')?.parentElement;
                if (!editorDOM) {
                  return;
                }

                const containerRect = editorDOM.getBoundingClientRect();
                const targetY =
                  containerRect.top +
                  (containerRect.height * options.position) / 100;
                const offset = coords.top - targetY;

                editorDOM.scrollBy({
                  top: offset,
                  behavior: 'smooth',
                });
              } catch {
                // coordsAtPos can throw if the position is not in the viewport
              }
            },
          };
        },
      }),
    ];
  },
});

export default TypewriterMode;
