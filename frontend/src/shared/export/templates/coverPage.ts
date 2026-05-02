// ============================================================
// 표지/제목 페이지 빌더
// ============================================================

import type { Block, TitlePageBlock } from '../tiptap/blocks';

export interface CoverPageInput {
  title: string;
  subtitle?: string;
  author: string;
  /** ISO 8601 또는 'yyyy.MM.dd' — 호출처에서 미리 포맷 권장 */
  date: string;
}

export function buildCoverPage(input: CoverPageInput): Block[] {
  const cover: TitlePageBlock = {
    kind: 'titlePage',
    title: input.title,
    ...(input.subtitle ? { subtitle: input.subtitle } : {}),
    author: input.author,
    date: input.date,
  };
  return [cover];
}

/**
 * Date → 'yyyy.MM.dd'.
 */
export function formatDate(d: Date = new Date()): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd}`;
}
