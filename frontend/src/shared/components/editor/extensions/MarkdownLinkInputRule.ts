/**
 * Markdown 링크 input rule — `[text](url)` 패턴을 입력 직후 link 마크로 변환.
 *
 * Tiptap 의 Link extension (StarterKit 에 포함) 은 paste/autolink 만 지원하고
 * markdown 단축키 input rule 은 자체적으로 추가하지 않는다. 작가가 본문 입력 중
 * `[Folio](https://folio-editor.co.kr)` 형태를 치면 그 자리에서 즉시 링크로
 * 변환되도록 별도 InputRule 을 제공한다.
 *
 * 동작:
 *   - `[text](url)` 입력 → text 가 link 마크 (href=url) 로 즉시 치환
 *   - href 가 protocol 없으면 `https://` 자동 prefix (StarterKit link.defaultProtocol 과 정합)
 *   - mailto:, http://, https:// 는 그대로 유지
 *   - 빈 text 또는 빈 url 은 변환 안 함 (안전 가드)
 */

import { Extension, markInputRule } from '@tiptap/core';

const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\(([^)]+)\)$/;

function normalizeHref(rawHref: string): string {
  const trimmed = rawHref.trim();
  if (!trimmed) return trimmed;
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export const MarkdownLinkInputRule = Extension.create({
  name: 'markdownLinkInputRule',

  addInputRules() {
    // schema 에 link mark 가 등록되어 있어야 동작 — StarterKit 의 Link 가 제공.
    const linkType = this.editor.schema.marks.link;
    if (!linkType) return [];

    return [
      markInputRule({
        find: MARKDOWN_LINK_PATTERN,
        type: linkType,
        getAttributes: (match) => {
          const href = normalizeHref(match[2] ?? '');
          if (!href) return false;
          return { href };
        },
      }),
    ];
  },
});
