// ============================================================
// TipTap JSON → Block[] 정규화
// ============================================================
// ContentEditor.tsx의 14개 extension 중 schema 영향이 있는 9개만 처리한다.
// 알 수 없는 노드는 무시(개발 콘솔에 1회 경고).
//
// 처리 노드:
//   StarterKit: doc, paragraph, heading, hardBreak, bulletList, orderedList,
//     listItem, blockquote, text, bold/italic/strike/underline marks
//   Highlight: highlight mark
//   TextStyle: color/fontFamily/fontSize via textStyle mark
//   TextAlign: paragraph/heading의 textAlign attr
//   SceneBreak: atom node (type='sceneBreak')
//   AuthorNote: mark (type='authorNote')
//
// 무시(decoration/input only):
//   KoreanPunctuation, AutoPairQuotes, TabIndent, TypewriterMode, FocusMode,
//   FindReplace, ReviewHighlight, CharacterCount, Placeholder, Typography
// ============================================================

import type {
  Block,
  HeadingBlock,
  Inline,
  InlineMarks,
  InlineRun,
  ListBlock,
  ParagraphBlock,
  TextAlign,
} from './blocks';

interface RawNode {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: RawNode[];
  marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
  text?: string;
}

const warned = new Set<string>();
function warnUnknown(type: string) {
  if (warned.has(type)) return;
  warned.add(type);
  if (typeof console !== 'undefined') {
    console.warn(`[export/walker] 알 수 없는 노드 무시: ${type}`);
  }
}

function readAlign(attrs: Record<string, unknown> | undefined): TextAlign | undefined {
  const v = attrs?.['textAlign'];
  if (v === 'left' || v === 'center' || v === 'right' || v === 'justify') return v;
  return undefined;
}

function collectMarks(
  rawMarks: RawNode['marks'],
  options: { includeAuthorNote: boolean },
): InlineMarks {
  const marks: InlineMarks = {};
  if (!rawMarks) return marks;
  for (const m of rawMarks) {
    switch (m.type) {
      case 'bold':
        marks.bold = true;
        break;
      case 'italic':
        marks.italic = true;
        break;
      case 'strike':
        marks.strike = true;
        break;
      case 'underline':
        marks.underline = true;
        break;
      case 'highlight':
        marks.highlight = true;
        break;
      case 'authorNote':
        marks.authorNote = true;
        break;
      case 'textStyle': {
        const attrs = m.attrs ?? {};
        if (typeof attrs.color === 'string') marks.color = attrs.color;
        if (typeof attrs.fontFamily === 'string') marks.fontFamily = attrs.fontFamily;
        if (typeof attrs.fontSize === 'string') marks.fontSize = attrs.fontSize;
        break;
      }
      default:
        // reviewHighlight 등 데코레이션은 보통 JSON에 없지만 들어온다면 무시
        break;
    }
  }
  if (!options.includeAuthorNote && marks.authorNote) {
    marks.authorNote = undefined;
  }
  return marks;
}

interface WalkOptions {
  /** AuthorNote mark을 본문에 포함할지. false면 mark만 제거(텍스트는 유지). */
  includeAuthorNote: boolean;
}

function walkInlines(
  nodes: RawNode[] | undefined,
  options: WalkOptions,
): Inline[] {
  if (!nodes) return [];
  const out: Inline[] = [];
  for (const node of nodes) {
    if (node.type === 'text') {
      const text = node.text ?? '';
      if (!text) continue;
      const marks = collectMarks(node.marks, options);
      const run: InlineRun = { kind: 'run', text, marks };
      // 합치기: 직전 run과 marks가 동일하면 텍스트만 이어붙임
      const prev = out[out.length - 1];
      if (
        prev &&
        prev.kind === 'run' &&
        sameMarks(prev.marks, run.marks)
      ) {
        prev.text += run.text;
      } else {
        out.push(run);
      }
    } else if (node.type === 'hardBreak') {
      out.push({ kind: 'br' });
    } else {
      // 인라인 자리에 다른 노드가 와도 무시(보통 없음)
      if (node.type) warnUnknown(node.type);
    }
  }
  return out;
}

function sameMarks(a: InlineMarks, b: InlineMarks): boolean {
  return (
    !!a.bold === !!b.bold &&
    !!a.italic === !!b.italic &&
    !!a.strike === !!b.strike &&
    !!a.underline === !!b.underline &&
    !!a.highlight === !!b.highlight &&
    !!a.authorNote === !!b.authorNote &&
    a.color === b.color &&
    a.fontFamily === b.fontFamily &&
    a.fontSize === b.fontSize
  );
}

function walkBlocks(nodes: RawNode[] | undefined, options: WalkOptions): Block[] {
  if (!nodes) return [];
  const out: Block[] = [];
  for (const node of nodes) {
    const block = walkBlockNode(node, options);
    if (block) out.push(...block);
  }
  return out;
}

function walkBlockNode(node: RawNode, options: WalkOptions): Block[] | null {
  switch (node.type) {
    case 'paragraph': {
      const inlines = walkInlines(node.content, options);
      const align = readAlign(node.attrs);
      const block: ParagraphBlock = { kind: 'paragraph', inlines, ...(align ? { align } : {}) };
      return [block];
    }
    case 'heading': {
      const level = clampLevel(node.attrs?.['level']);
      const inlines = walkInlines(node.content, options);
      const align = readAlign(node.attrs);
      const block: HeadingBlock = {
        kind: 'heading',
        level,
        inlines,
        ...(align ? { align } : {}),
      };
      return [block];
    }
    case 'hardBreak':
      // 블록 자리에 hardBreak가 단독으로 오는 경우는 paragraph로 감쌈
      return [{ kind: 'paragraph', inlines: [{ kind: 'br' }] }];
    case 'bulletList':
    case 'orderedList': {
      const items: Block[][] = [];
      for (const li of node.content ?? []) {
        if (li.type !== 'listItem') continue;
        items.push(walkBlocks(li.content, options));
      }
      const block: ListBlock = {
        kind: 'list',
        ordered: node.type === 'orderedList',
        items,
      };
      return [block];
    }
    case 'listItem':
      // 보통 list 내부에서만 나타나지만 단독으로 와도 자식만 펼침
      return walkBlocks(node.content, options);
    case 'blockquote':
      return [{ kind: 'blockquote', children: walkBlocks(node.content, options) }];
    case 'sceneBreak':
      return [{ kind: 'sceneBreak' }];
    case 'image':
      // ContentEditor에 등록 안 됨. 혹시 들어와도 alt 텍스트로 대체.
      return [
        {
          kind: 'paragraph',
          inlines: [{ kind: 'run', text: '[이미지]', marks: {} }],
        },
      ];
    default:
      if (node.type) warnUnknown(node.type);
      return null;
  }
}

function clampLevel(v: unknown): 1 | 2 | 3 | 4 | 5 | 6 {
  const n = typeof v === 'number' ? v : 1;
  if (n < 1) return 1;
  if (n > 6) return 6;
  return n as 1 | 2 | 3 | 4 | 5 | 6;
}

/**
 * TipTap JSON 문자열(또는 객체)을 Block[]로 정규화.
 * null/빈 문자열/파싱 실패 시 빈 배열을 반환한다.
 */
export function parseTipTapContent(
  raw: string | null | undefined,
  options: WalkOptions,
): Block[] {
  if (!raw) return [];
  let json: unknown;
  if (typeof raw === 'string') {
    try {
      json = JSON.parse(raw);
    } catch {
      return [];
    }
  } else {
    json = raw;
  }
  const root = json as RawNode;
  if (!root || root.type !== 'doc') return [];
  return walkBlocks(root.content, options);
}
