// ============================================================
// 에피소드 본문 묶음 빌더
// ============================================================
// parent_id 트리 + sort_order ASC 순서로 깊이우선 순회하며 본문을 펼친다.
// 각 에피소드마다:
//   - 회차 제목(heading 레벨은 depth + 2)
//   - 본문(walker가 만든 Block[])
//   - 다음 에피소드 사이 pageBreak
// ============================================================

import { parseTipTapContent } from '../tiptap/walker';
import type {
  Block,
  HeadingBlock,
  PageBreakBlock,
} from '../tiptap/blocks';
import type { EpisodeSnapshot } from '../../types/export';

export interface EpisodeBundleOptions {
  includeAuthorNote: boolean;
}

export function buildEpisodeBundle(
  episodes: EpisodeSnapshot[],
  options: EpisodeBundleOptions,
): Block[] {
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

  const out: Block[] = [];
  let first = true;

  function visit(parentId: string | null, depth: number) {
    const children = byParent.get(parentId) ?? [];
    for (const ep of children) {
      if (!first) {
        out.push({ kind: 'pageBreak' } satisfies PageBreakBlock);
      }
      first = false;

      const level = (Math.min(2 + depth, 6)) as 1 | 2 | 3 | 4 | 5 | 6;
      out.push({
        kind: 'heading',
        level,
        inlines: [{ kind: 'run', text: ep.title?.trim() || '(제목 없음)', marks: {} }],
      } satisfies HeadingBlock);

      const body = parseTipTapContent(ep.content, options);
      out.push(...body);

      visit(ep.id, depth + 1);
    }
  }
  visit(null, 0);
  return out;
}
