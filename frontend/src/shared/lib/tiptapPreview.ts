import { generateHTML } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';

/** generateHTML용 최소 확장 세트 — 편집/저장 무관, 표시용 */
export const previewExtensions = [
  StarterKit.configure({ code: false, codeBlock: false }),
  Highlight.configure({ multicolor: false }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
];

/** TipTap JSON 문자열을 HTML로 변환. null/잘못된 JSON은 빈 문자열. */
export function contentToHtml(raw: string | null | undefined): string {
  if (!raw) return '';
  try {
    const json = JSON.parse(raw) as object;
    return generateHTML(json, previewExtensions);
  } catch {
    return '';
  }
}
