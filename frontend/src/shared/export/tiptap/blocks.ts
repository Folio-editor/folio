// ============================================================
// 추상 블록 모델 — TipTap JSON과 포맷별 출력의 중간 표현
// ============================================================
// walker.ts가 TipTap JSON을 Block[]로 정규화하고, 각 formatter는
// Block[]을 입력으로 TXT/DOCX/HTML을 생성한다. 14개 extension 중 schema에
// 영향을 주는 9개만 다룬다(나머지는 데코레이션/입력 보조).
// ============================================================

export interface InlineMarks {
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  underline?: boolean;
  highlight?: boolean;
  authorNote?: boolean;
  /** textStyle attrs */
  color?: string;
  fontFamily?: string;
  fontSize?: string;
}

export interface InlineRun {
  kind: 'run';
  text: string;
  marks: InlineMarks;
}

export interface HardBreak {
  kind: 'br';
}

export type Inline = InlineRun | HardBreak;

export type TextAlign = 'left' | 'center' | 'right' | 'justify';

export interface ParagraphBlock {
  kind: 'paragraph';
  align?: TextAlign;
  inlines: Inline[];
}

export interface HeadingBlock {
  kind: 'heading';
  level: 1 | 2 | 3 | 4 | 5 | 6;
  align?: TextAlign;
  inlines: Inline[];
}

export interface SceneBreakBlock {
  kind: 'sceneBreak';
}

export interface ListBlock {
  kind: 'list';
  ordered: boolean;
  items: Block[][];
}

export interface BlockquoteBlock {
  kind: 'blockquote';
  children: Block[];
}

/** 표지/목차/섹션 헤더 등 템플릿이 직접 만드는 큰 제목(독립 페이지 단위) */
export interface TitlePageBlock {
  kind: 'titlePage';
  title: string;
  subtitle?: string;
  author: string;
  /** 'yyyy.MM.dd' 형식 */
  date: string;
}

/** 표지 다음 또는 섹션 도입 등에서 페이지 분리 */
export interface PageBreakBlock {
  kind: 'pageBreak';
}

/** 본문 흐름 외 정적 표 — 캐릭터 커스텀 필드 등 */
export interface KeyValueTableBlock {
  kind: 'keyValueTable';
  rows: Array<{ key: string; value: string }>;
}

export type Block =
  | ParagraphBlock
  | HeadingBlock
  | SceneBreakBlock
  | ListBlock
  | BlockquoteBlock
  | TitlePageBlock
  | PageBreakBlock
  | KeyValueTableBlock;

export function plainText(inlines: Inline[]): string {
  let out = '';
  for (const it of inlines) {
    if (it.kind === 'br') out += '\n';
    else out += it.text;
  }
  return out;
}
