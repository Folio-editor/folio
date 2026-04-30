// ============================================================
// Block[] → 인쇄용 self-contained HTML
// ============================================================
// Electron printToPDF / Web window.print() 양쪽에서 동일하게 사용.
// 외부 폰트 파일 의존 없이 시스템 폰트 스택만 사용한다.
// 페이지 번호는 Chromium의 @page { @bottom-center } 로 자동 표시되며,
// Firefox 등 미지원 환경은 푸터 표시 안 됨(P1 폴백).
// ============================================================

import type { Block, Inline, InlineMarks } from '../tiptap/blocks';

export interface HtmlForPrintOptions {
  pageSize: 'A4' | 'Letter';
  fontFamily: 'sans' | 'serif';
  /** <title> 태그 — Electron printToPDF의 헤더 자리에 노출 */
  documentTitle: string;
}

export function blocksToPrintHtml(
  blocks: Block[],
  options: HtmlForPrintOptions,
): string {
  const body = blocks.map(renderBlock).join('\n');
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(options.documentTitle)}</title>
<style>${baseStyle(options)}</style>
</head>
<body data-font="${options.fontFamily}">
${body}
</body>
</html>`;
}

function baseStyle(options: HtmlForPrintOptions): string {
  return `
@page { size: ${options.pageSize}; margin: 18mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { color: #111; line-height: 1.7; font-size: 11pt;
       font-family: 'Pretendard', '맑은 고딕', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif; }
body[data-font="serif"] { font-family: '본명조', '바탕', 'Batang', 'Apple SD Gothic Neo', serif; }
h1 { font-size: 20pt; margin: 0 0 0.6em; }
h2 { font-size: 16pt; margin: 1.2em 0 0.4em; }
h3 { font-size: 13pt; margin: 1em 0 0.3em; }
h4, h5, h6 { font-size: 12pt; margin: 0.8em 0 0.2em; }
p { margin: 0 0 0.7em; text-indent: 1em; }
.no-indent { text-indent: 0; }
ul, ol { margin: 0 0 0.7em 1.4em; padding: 0; }
li { margin: 0.15em 0; }
blockquote { margin: 0.6em 0; padding: 0.4em 1em; border-left: 3px solid #ccc; color: #444; }
.scene-break { text-align: center; letter-spacing: 0.4em; margin: 1.6em 0; color: #666; }
.author-note { color: #666; font-style: italic; }
mark { background: #fff5a8; padding: 0 0.1em; }
.cover-page { display: flex; flex-direction: column; align-items: center; justify-content: center;
              text-align: center; min-height: 90vh; page-break-after: always; }
.cover-page .title { font-size: 28pt; font-weight: 700; margin: 0; }
.cover-page .subtitle { font-size: 14pt; color: #555; margin-top: 0.6em; }
.cover-page .meta { margin-top: 4em; font-size: 11pt; color: #444; }
.toc { page-break-after: always; }
.toc h2 { border-bottom: 1px solid #ddd; padding-bottom: 0.3em; }
.toc ul { list-style: none; margin-left: 0; }
.toc li { padding: 0.25em 0; }
.toc .toc-section { font-weight: 600; margin-top: 0.6em; }
.kv-table { border-collapse: collapse; margin: 0.4em 0 0.8em; }
.kv-table th, .kv-table td { padding: 0.3em 0.6em; border: 1px solid #ddd; text-align: left; vertical-align: top; }
.kv-table th { background: #f7f7f7; font-weight: 600; width: 30%; }
.page-break { page-break-after: always; }
@media print {
  body { font-size: 11pt; }
  .scene-break { color: #000; }
  .author-note { color: #444; }
}`.trim();
}

function renderBlock(block: Block): string {
  switch (block.kind) {
    case 'titlePage':
      return `<section class="cover-page">
  <h1 class="title">${escapeHtml(block.title)}</h1>
  ${block.subtitle ? `<div class="subtitle">${escapeHtml(block.subtitle)}</div>` : ''}
  <div class="meta">
    <div>${escapeHtml(block.author)}</div>
    <div>${escapeHtml(block.date)}</div>
  </div>
</section>`;
    case 'pageBreak':
      return `<div class="page-break"></div>`;
    case 'paragraph': {
      const align = block.align ? ` style="text-align:${block.align}"` : '';
      const inner = renderInlines(block.inlines);
      const cls = inner === '' ? ' class="no-indent"' : '';
      return `<p${align}${cls}>${inner || '&nbsp;'}</p>`;
    }
    case 'heading': {
      const align = block.align ? ` style="text-align:${block.align}"` : '';
      return `<h${block.level}${align}>${renderInlines(block.inlines)}</h${block.level}>`;
    }
    case 'sceneBreak':
      return `<div class="scene-break">* * *</div>`;
    case 'list': {
      const tag = block.ordered ? 'ol' : 'ul';
      const items = block.items
        .map((children) => `<li>${children.map(renderBlock).join('')}</li>`)
        .join('\n');
      return `<${tag}>\n${items}\n</${tag}>`;
    }
    case 'blockquote':
      return `<blockquote>${block.children.map(renderBlock).join('')}</blockquote>`;
    case 'keyValueTable': {
      const rows = block.rows
        .map(
          (r) =>
            `<tr><th>${escapeHtml(r.key)}</th><td>${escapeHtml(r.value)}</td></tr>`,
        )
        .join('');
      return `<table class="kv-table">${rows}</table>`;
    }
  }
}

function renderInlines(inlines: Inline[]): string {
  let out = '';
  for (const it of inlines) {
    if (it.kind === 'br') {
      out += '<br />';
      continue;
    }
    out += wrapInlineRun(escapeHtml(it.text), it.marks);
  }
  return out;
}

function wrapInlineRun(text: string, marks: InlineMarks): string {
  let html = text;
  if (marks.highlight) html = `<mark>${html}</mark>`;
  if (marks.strike) html = `<s>${html}</s>`;
  if (marks.underline) html = `<u>${html}</u>`;
  if (marks.italic) html = `<em>${html}</em>`;
  if (marks.bold) html = `<strong>${html}</strong>`;
  const styles: string[] = [];
  if (marks.color) styles.push(`color:${escapeAttr(marks.color)}`);
  if (marks.fontFamily) styles.push(`font-family:${escapeAttr(marks.fontFamily)}`);
  if (marks.fontSize) styles.push(`font-size:${escapeAttr(marks.fontSize)}`);
  if (styles.length) {
    html = `<span style="${styles.join(';')}">${html}</span>`;
  }
  if (marks.authorNote) {
    html = `<span class="author-note">${html}</span>`;
  }
  return html;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  // CSS 값에 들어갈 텍스트의 위험문자만 정리
  return s.replace(/[<>"';]/g, '');
}
