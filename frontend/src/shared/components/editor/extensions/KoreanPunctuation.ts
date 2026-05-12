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

          tr.insertText('……', range.from, range.to);
        },
      }),

      // ⚠ 이전: '--' → em-dash × 2 (——) 자동 변환 룰 있었음.
      // ★ 제거됨 — markdown 가로선 '---' 입력 시 두 번째 '-' 시점에 이 룰이 가로채
      //   prefix + em-dash 두 개로 변환했고, 그 결과 StarterKit HorizontalRule 의
      //   ^---$ input rule 이 영원히 매칭할 수 없었다. HR 변환 우선.
      //   em-dash 가 필요하면 OS IME 또는 복붙으로 처리.
    ];
  },
});

export default KoreanPunctuation;
