/**
 * HorizontalRule input rule 강제 보강.
 *
 * StarterKit 의 HorizontalRule 이 같은 input rule 을 갖고 있지만 일부 환경에서
 * Typography 등 다른 input rule 과 경쟁하여 발화 못 하는 케이스 관찰됨.
 * 본 extension 은 동일 패턴을 한 번 더 등록해 horizontal rule 변환을 강제한다.
 *
 * 매칭 패턴 — paragraph 의 텍스트가 정확히 다음 중 하나일 때 마지막 char 입력 직후 발화:
 *   - `---`
 *   - `___`
 *   - `***`
 *
 * 발화 시 paragraph 가 hr 노드로 교체되고 그 뒤 새 빈 paragraph 가 자동 생성된다 (Tiptap 기본 동작).
 */

import { Extension, nodeInputRule } from '@tiptap/core';

export const ForceHorizontalRule = Extension.create({
  name: 'forceHorizontalRule',

  addInputRules() {
    const type = this.editor.schema.nodes.horizontalRule;
    if (!type) return [];
    return [
      nodeInputRule({
        find: /^---$/,
        type,
      }),
      nodeInputRule({
        find: /^___$/,
        type,
      }),
      nodeInputRule({
        find: /^\*\*\*$/,
        type,
      }),
    ];
  },
});
