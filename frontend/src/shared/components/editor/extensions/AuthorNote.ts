import { Mark, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    authorNote: {
      toggleAuthorNote: () => ReturnType;
    };
  }
}

const AuthorNote = Mark.create({
  name: 'authorNote',

  parseHTML() {
    return [{ tag: 'span[data-type="author-note"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(
        { class: 'author-note', 'data-type': 'author-note' },
        HTMLAttributes,
      ),
      0,
    ];
  },

  addCommands() {
    return {
      toggleAuthorNote:
        () =>
        ({ commands }) => {
          return commands.toggleMark(this.name);
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-m': () => this.editor.commands.toggleAuthorNote(),
    };
  },
});

export default AuthorNote;
