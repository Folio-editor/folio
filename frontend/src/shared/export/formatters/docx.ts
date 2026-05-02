// ============================================================
// Block[] → docx.Document
// ============================================================
// Packer.toBuffer()는 Electron Main, Packer.toBlob()은 Web에서 호출한다.
// 이 모듈은 Document 객체까지만 만들고, 직렬화는 어댑터에 위임한다.
// ============================================================

import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  type IRunOptions,
  PageBreak,
} from 'docx';
import type { Block, Inline, InlineMarks, TextAlign } from '../tiptap/blocks';

export function blocksToDocxDocument(blocks: Block[]): Document {
  const children: Paragraph[] = [];
  for (const block of blocks) {
    children.push(...renderBlock(block));
  }
  return new Document({
    creator: 'Folio',
    styles: {
      default: {
        document: { run: { font: '맑은 고딕', size: 22 } }, // size = half-points (22 = 11pt)
      },
    },
    sections: [{ children }],
  });
}

function renderBlock(block: Block): Paragraph[] {
  switch (block.kind) {
    case 'titlePage':
      return renderTitlePage(block.title, block.subtitle, block.author, block.date);
    case 'pageBreak':
      return [new Paragraph({ children: [new PageBreak()] })];
    case 'paragraph':
      return [
        new Paragraph({
          ...alignment(block.align),
          children: inlinesToRuns(block.inlines),
        }),
      ];
    case 'heading':
      return [
        new Paragraph({
          heading: headingLevel(block.level),
          ...alignment(block.align),
          children: inlinesToRuns(block.inlines),
        }),
      ];
    case 'sceneBreak':
      return [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 240, after: 240 },
          children: [new TextRun({ text: '* * *' })],
        }),
      ];
    case 'list':
      return renderList(block.items, block.ordered, 0);
    case 'blockquote':
      return renderBlockquote(block.children);
    case 'keyValueTable':
      // 1차에선 단순 paragraph로 — DOCX Table을 별도로 빌드하면 더 좋지만 복잡도 절감
      return block.rows.map(
        (r) =>
          new Paragraph({
            children: [
              new TextRun({ text: `${r.key}: `, bold: true }),
              new TextRun({ text: r.value }),
            ],
          }),
      );
  }
}

function renderBlockquote(children: Block[]): Paragraph[] {
  const out: Paragraph[] = [];
  for (const child of children) {
    if (child.kind === 'paragraph') {
      out.push(
        new Paragraph({
          indent: { left: 720 },
          ...alignment(child.align),
          children: inlinesToRuns(child.inlines),
        }),
      );
    } else if (child.kind === 'heading') {
      out.push(
        new Paragraph({
          heading: headingLevel(child.level),
          indent: { left: 720 },
          ...alignment(child.align),
          children: inlinesToRuns(child.inlines),
        }),
      );
    } else {
      // 중첩 blockquote/list 등은 평소대로 렌더 후 indent를 직접 못 주므로 단순 위임
      out.push(...renderBlock(child));
    }
  }
  return out;
}

function renderList(
  items: Block[][],
  ordered: boolean,
  depth: number,
): Paragraph[] {
  const out: Paragraph[] = [];
  items.forEach((children, i) => {
    const marker = ordered ? `${i + 1}. ` : '• ';
    // 첫 자식이 paragraph인 경우 마커를 그 안에 prepend
    let prefixed = false;
    for (const child of children) {
      if (!prefixed && child.kind === 'paragraph') {
        out.push(
          new Paragraph({
            indent: { left: 360 + depth * 360 },
            children: [
              new TextRun({ text: marker }),
              ...inlinesToRuns(child.inlines),
            ],
          }),
        );
        prefixed = true;
      } else if (child.kind === 'list') {
        out.push(...renderList(child.items, child.ordered, depth + 1));
      } else {
        out.push(...renderBlock(child));
      }
    }
    if (!prefixed) {
      // paragraph가 없는 항목 — 마커 단독
      out.push(
        new Paragraph({
          indent: { left: 360 + depth * 360 },
          children: [new TextRun({ text: marker })],
        }),
      );
    }
  });
  return out;
}

function renderTitlePage(
  title: string,
  subtitle: string | undefined,
  author: string,
  date: string,
): Paragraph[] {
  const out: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 2400, after: 240 },
      children: [new TextRun({ text: title, bold: true, size: 56 })], // 28pt
    }),
  ];
  if (subtitle) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 480 },
        children: [new TextRun({ text: subtitle, size: 28 })], // 14pt
      }),
    );
  }
  out.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 1200, after: 120 },
      children: [new TextRun({ text: author })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: date })],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  );
  return out;
}

function inlinesToRuns(inlines: Inline[]): TextRun[] {
  const runs: TextRun[] = [];
  for (const it of inlines) {
    if (it.kind === 'br') {
      runs.push(new TextRun({ break: 1 }));
      continue;
    }
    runs.push(new TextRun(buildRunOptions(it.text, it.marks)));
  }
  return runs;
}

function buildRunOptions(text: string, marks: InlineMarks): IRunOptions {
  const opts: Record<string, unknown> = { text };
  if (marks.bold) opts.bold = true;
  if (marks.italic) opts.italics = true;
  if (marks.strike) opts.strike = true;
  if (marks.underline) opts.underline = {};
  if (marks.highlight) opts.highlight = 'yellow';
  if (marks.color) {
    const hex = normalizeHexColor(marks.color);
    if (hex) opts.color = hex;
  }
  if (marks.fontFamily) opts.font = marks.fontFamily;
  if (marks.fontSize) {
    const pt = parsePtSize(marks.fontSize);
    if (pt) opts.size = pt * 2; // half-points
  }
  if (marks.authorNote) {
    // AuthorNote는 italic + 회색 — 다른 마크와 충돌 없이 덮어쓰기
    opts.italics = true;
    if (!opts.color) opts.color = '666666';
  }
  return opts as IRunOptions;
}

function alignment(a: TextAlign | undefined): { alignment?: (typeof AlignmentType)[keyof typeof AlignmentType] } {
  switch (a) {
    case 'center':
      return { alignment: AlignmentType.CENTER };
    case 'right':
      return { alignment: AlignmentType.RIGHT };
    case 'justify':
      return { alignment: AlignmentType.JUSTIFIED };
    case 'left':
    default:
      return {};
  }
}

function headingLevel(level: 1 | 2 | 3 | 4 | 5 | 6): (typeof HeadingLevel)[keyof typeof HeadingLevel] {
  switch (level) {
    case 1: return HeadingLevel.HEADING_1;
    case 2: return HeadingLevel.HEADING_2;
    case 3: return HeadingLevel.HEADING_3;
    case 4: return HeadingLevel.HEADING_4;
    case 5: return HeadingLevel.HEADING_5;
    case 6: return HeadingLevel.HEADING_6;
  }
}

function normalizeHexColor(input: string): string | null {
  const m = input.trim().match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!m) return null;
  let hex = m[1];
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  return hex.toUpperCase();
}

function parsePtSize(input: string): number | null {
  const m = input.trim().match(/^(\d+(?:\.\d+)?)(?:pt|px)?$/);
  if (!m) return null;
  return Math.round(parseFloat(m[1]));
}
