// ============================================================
// 목차 빌더
// ============================================================
// 페이지 번호는 표시하지 않는다(DOCX/HTML 정적 목차 — printToPDF/window.print
// 시점에 동적으로 페이지가 결정되므로 정확한 번호 매기기 어려움).
// 에피소드 트리는 parent_id 기반 들여쓰기로 표현.
// ============================================================

import type {
  Block,
  HeadingBlock,
  ParagraphBlock,
  PageBreakBlock,
} from '../tiptap/blocks';
import type { EpisodeSnapshot } from '../../types/export';

export interface TocSection {
  /** 섹션 헤더 — 본문 위치를 안내 */
  header: string;
  /** 들여쓰기 레벨(0~) */
  items: Array<{ depth: number; label: string }>;
}

export function buildToc(sections: TocSection[]): Block[] {
  const out: Block[] = [];
  out.push({
    kind: 'heading',
    level: 1,
    inlines: [{ kind: 'run', text: '목차', marks: {} }],
  } satisfies HeadingBlock);

  for (const section of sections) {
    if (section.items.length === 0) continue;
    out.push({
      kind: 'heading',
      level: 3,
      inlines: [{ kind: 'run', text: section.header, marks: {} }],
    } satisfies HeadingBlock);

    for (const item of section.items) {
      const indent = item.depth > 0 ? '  '.repeat(item.depth) : '';
      out.push({
        kind: 'paragraph',
        inlines: [{ kind: 'run', text: indent + item.label, marks: {} }],
      } satisfies ParagraphBlock);
    }
  }

  out.push({ kind: 'pageBreak' } satisfies PageBreakBlock);
  return out;
}

/**
 * 에피소드 트리를 depth-first 순회해 TOC 항목으로 변환한다.
 * sort_order ASC, parent_id로 트리 구성.
 */
export function buildEpisodeTocItems(
  episodes: EpisodeSnapshot[],
): Array<{ depth: number; label: string }> {
  const byParent = new Map<string | null, EpisodeSnapshot[]>();
  for (const ep of episodes) {
    const key = ep.parent_id ?? null;
    const list = byParent.get(key) ?? [];
    list.push(ep);
    byParent.set(key, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.sort_order - b.sort_order);
  }

  const out: Array<{ depth: number; label: string }> = [];
  function visit(parentId: string | null, depth: number) {
    const children = byParent.get(parentId) ?? [];
    for (const ep of children) {
      out.push({
        depth,
        label: ep.title?.trim() || '(제목 없음)',
      });
      visit(ep.id, depth + 1);
    }
  }
  visit(null, 0);
  return out;
}
