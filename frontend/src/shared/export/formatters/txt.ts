// ============================================================
// Block[] → TXT
// ============================================================
// 마크 정보(bold/italic/color/...)는 모두 폐기한다(평문).
// 줄바꿈 규칙:
//   paragraph 사이: \n\n
//   hardBreak: \n
//   sceneBreak: \n\n* * *\n\n
//   list: 마커("• " / "1. ") + 본문, 항목 사이 \n
//   blockquote: 각 줄 앞에 "> "
// ============================================================

import type { Block, Inline } from '../tiptap/blocks';

export function blocksToTxt(blocks: Block[]): string {
  return blocks.map(renderBlock).filter((s) => s.length > 0).join('\n\n').trim() + '\n';
}

function renderBlock(block: Block, listDepth = 0): string {
  switch (block.kind) {
    case 'titlePage': {
      const lines = [block.title];
      if (block.subtitle) lines.push(block.subtitle);
      lines.push('');
      lines.push(`작가: ${block.author}`);
      lines.push(`작성일: ${block.date}`);
      lines.push('');
      lines.push('───────────────');
      return lines.join('\n');
    }
    case 'pageBreak':
      return '\n\f\n'; // form-feed — TXT viewer는 무시하지만 의미 보존
    case 'paragraph':
      return inlinesToText(block.inlines);
    case 'heading': {
      const text = inlinesToText(block.inlines);
      const prefix = '#'.repeat(block.level) + ' ';
      return prefix + text;
    }
    case 'sceneBreak':
      return '* * *';
    case 'list': {
      const lines: string[] = [];
      block.items.forEach((children, i) => {
        const marker = block.ordered ? `${i + 1}. ` : '• ';
        const indent = '  '.repeat(listDepth);
        const inner = children
          .map((child) => renderBlock(child, listDepth + 1))
          .join('\n');
        const firstLineIndented = indent + marker + inner.replace(/\n/g, '\n' + indent + '   ');
        lines.push(firstLineIndented);
      });
      return lines.join('\n');
    }
    case 'blockquote': {
      const inner = block.children.map((c) => renderBlock(c, listDepth)).join('\n\n');
      return inner
        .split('\n')
        .map((line) => (line ? `> ${line}` : '>'))
        .join('\n');
    }
    case 'keyValueTable': {
      return block.rows.map((r) => `${r.key}: ${r.value}`).join('\n');
    }
  }
}

function inlinesToText(inlines: Inline[]): string {
  let out = '';
  for (const it of inlines) {
    if (it.kind === 'br') out += '\n';
    else out += it.text;
  }
  return out;
}
