import { Extension, InputRule } from '@tiptap/core';

export interface KoreanPunctuationOptions {
  enabled: boolean;
}

const KoreanPunctuation = Extension.create<KoreanPunctuationOptions>({
  name: 'koreanPunctuation',

  addOptions() {
    return {
      enabled: true,
    };
  },

  addInputRules() {
    if (!this.options.enabled) {
      return [];
    }

    return [
      // Three dots → Korean ellipsis (U+2026 × 2)
      new InputRule({
        find: /\.\.\.$/,
        handler: ({ state, range }) => {
          const { tr } = state;

          tr.insertText('\u2026\u2026', range.from, range.to);
        },
      }),

      // Two hyphens → em dash × 2
      new InputRule({
        find: /(?:^|\s)--$/,
        handler: ({ state, range, match }) => {
          const { tr } = state;
          const prefix = match[0].startsWith('--') ? '' : match[0][0];
          const insertText = `${prefix}\u2014\u2014`;

          tr.insertText(insertText, range.from, range.to);
        },
      }),
    ];
  },
});

export default KoreanPunctuation;
