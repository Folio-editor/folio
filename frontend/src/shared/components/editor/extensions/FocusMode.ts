import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface FocusModeOptions {
  enabled: boolean;
}

const focusModePluginKey = new PluginKey('focusMode');

const FocusMode = Extension.create<FocusModeOptions>({
  name: 'focusMode',

  addOptions() {
    return {
      enabled: false,
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-f': () => {
        // Toggle is managed externally via config; this shortcut is a hook
        // for the UI layer to listen to. Return true to prevent default.
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const extensionThis = this;

    return [
      new Plugin({
        key: focusModePluginKey,

        state: {
          init(_, state) {
            if (!extensionThis.options.enabled) {
              return DecorationSet.empty;
            }
            return buildDecorations(state);
          },

          apply(tr, oldDecoSet, _oldState, newState) {
            if (!extensionThis.options.enabled) {
              return DecorationSet.empty;
            }

            // Rebuild decorations when the document or selection changes
            if (tr.docChanged || tr.selectionSet) {
              return buildDecorations(newState);
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
      state: import('@tiptap/pm/state').EditorState,
    ): DecorationSet {
      const { selection, doc } = state;
      const decorations: Decoration[] = [];

      // Find the top-level block node that contains the cursor
      const resolvedPos = selection.$head;
      const depth = Math.min(resolvedPos.depth, 1);
      const focusedNodePos =
        depth > 0 ? resolvedPos.before(1) : resolvedPos.pos;

      doc.forEach((node, pos) => {
        if (pos === focusedNodePos) {
          decorations.push(
            Decoration.node(pos, pos + node.nodeSize, {
              class: 'has-focus',
            }),
          );
        }
      });

      return DecorationSet.create(doc, decorations);
    }
  },
});

export default FocusMode;
