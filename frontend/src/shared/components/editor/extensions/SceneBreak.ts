import { Node, mergeAttributes, InputRule } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    sceneBreak: {
      insertSceneBreak: () => ReturnType;
    };
  }
}

const SceneBreak = Node.create({
  name: 'sceneBreak',

  group: 'block',

  atom: true,

  parseHTML() {
    return [{ tag: 'div[data-type="scene-break"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(
        { class: 'scene-break', 'data-type': 'scene-break' },
        HTMLAttributes,
      ),
      '* * *',
    ];
  },

  addCommands() {
    return {
      insertSceneBreak:
        () =>
        ({ chain }) => {
          return chain()
            .insertContent({ type: this.name })
            .run();
        },
    };
  },

  addInputRules() {
    return [
      new InputRule({
        find: /^\*\*\*\s$/,
        handler: ({ state, range }) => {
          const { tr } = state;

          tr.delete(range.from, range.to);
          tr.insert(range.from, this.type.create());
        },
      }),
    ];
  },
});

export default SceneBreak;
