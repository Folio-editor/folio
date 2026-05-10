type TiptapMark = {
  type: string;
  attrs?: Record<string, unknown>;
};

type TiptapNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: TiptapMark[];
  text?: string;
};

export interface PlanTemplate {
  id: string;
  label: string;
  description: string;
  iconKey: 'file' | 'sparkles' | 'bookOpen' | 'globe' | 'lightbulb';
  content: TiptapNode | null;
}

const bold: TiptapMark = { type: 'bold' };

const text = (value: string, marks?: TiptapMark[]): TiptapNode => ({
  type: 'text',
  text: value,
  ...(marks ? { marks } : {}),
});

const paragraph = (...content: TiptapNode[]): TiptapNode => ({
  type: 'paragraph',
  content: content.length > 0 ? content : undefined,
});

const line = (value: string): TiptapNode => paragraph(text(value));

const field = (label: string, hint = ''): TiptapNode =>
  hint ? paragraph(text(`${label} `, [bold]), text(hint)) : paragraph(text(label, [bold]));

const heading = (level: 1 | 2 | 3, value: string): TiptapNode => ({
  type: 'heading',
  attrs: { level },
  content: [text(value)],
});

const quote = (value: string): TiptapNode => ({
  type: 'blockquote',
  content: [line(value)],
});

const bulletList = (items: TiptapNode[]): TiptapNode => ({
  type: 'bulletList',
  content: items.map((item) => ({
    type: 'listItem',
    content: [item],
  })),
});

const horizontalRule = (): TiptapNode => ({ type: 'horizontalRule' });

const spacer = (): TiptapNode => paragraph();

const doc = (content: TiptapNode[]): TiptapNode => ({ type: 'doc', content });

export const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    id: 'empty',
    label: '빈 서식',
    description: '템플릿 없이 자유롭게 작성합니다.',
    iconKey: 'file',
    content: null,
  },
  {
    id: 'basic-story-plan',
    label: '기본 작품 기획',
    description: '작품의 핵심, 주인공, 갈등을 빠르게 잡습니다.',
    iconKey: 'lightbulb',
    content: doc([
      heading(1, '기본 작품 기획'),
      quote('작품의 핵심을 짧고 선명하게 잡아두는 시작용 기획서입니다.'),
      horizontalRule(),
      heading(2, '한 줄 소개'),
      line('이 작품을 한 문장으로 설명하면?'),
      heading(2, '로그라인'),
      line('누가, 어떤 목표를 위해, 무엇과 맞서고, 어떤 변화에 도달하는 이야기인가?'),
      heading(2, '장르와 분위기'),
      line('장르:'),
      line('분위기:'),
      line('독자에게 남기고 싶은 감정:'),
      heading(2, '핵심 매력'),
      line('이 작품에서 가장 강하게 밀고 갈 재미는?'),
      heading(2, '주인공'),
      line('이름:'),
      line('원하는 것:'),
      line('부족한 것:'),
      line('두려워하는 것:'),
      line('변화 방향:'),
      heading(2, '중심 갈등'),
      line('주인공을 끝까지 움직이게 만드는 가장 큰 문제는?'),
      heading(2, '결말 방향'),
      line('이 이야기는 어디로 향하는가?'),
    ]),
  },
  {
    id: 'serial-long-plan',
    label: '중장편/연재 기획',
    description: '초반 후킹, 독자 보상, 장기 전개를 설계합니다.',
    iconKey: 'bookOpen',
    content: doc([
      heading(1, '중장편/연재 기획'),
      quote('장편이나 연재 작품을 쓰기 전에 초반 후킹, 독자 약속, 전체 흐름을 잡아두는 기획서입니다.'),
      horizontalRule(),
      heading(2, '작품명'),
      spacer(),
      heading(2, '장르 / 타깃 독자'),
      line('장르:'),
      line('타깃 독자:'),
      line('연재 형식:'),
      heading(2, '핵심 키워드'),
      line('예: 회귀, 복수, 성장, 아카데미, 로맨스, 미스터리'),
      heading(2, '한 줄 콘셉트'),
      line('이 작품을 가장 매력적으로 설명하는 한 문장.'),
      heading(2, '로그라인'),
      line('주인공이 어떤 목표를 위해 무엇과 맞서며, 어떤 변화에 도달하는가?'),
      heading(2, '초반 후킹'),
      line('1화 또는 초반부에서 독자를 붙잡는 사건은?'),
      heading(2, '독자 약속'),
      line('독자가 이 작품에서 반복적으로 기대할 수 있는 재미는?'),
      heading(2, '주인공 설계'),
      line('욕망:'),
      line('결핍:'),
      line('능력 / 강점:'),
      line('약점:'),
      line('변화 방향:'),
      heading(2, '주요 인물 관계'),
      line('조력자:'),
      line('라이벌:'),
      line('적대자:'),
      line('감정선:'),
      heading(2, '전체 줄거리'),
      line('초반:'),
      line('중반:'),
      line('후반:'),
      line('결말:'),
      heading(2, '회차 운영 메모'),
      line('예상 분량:'),
      line('한 회차 평균 분량:'),
      line('주요 전환점:'),
    ]),
  },
  {
    id: 'world-genre-plan',
    label: '장르/세계관 기획',
    description: '세계의 규칙, 세력, 비밀을 중심으로 정리합니다.',
    iconKey: 'globe',
    content: doc([
      heading(1, '장르/세계관 기획'),
      quote('세계관과 장르 설정이 중요한 작품을 위해, 규칙과 세력, 갈등 구조를 정리하는 기획서입니다.'),
      horizontalRule(),
      heading(2, '작품 콘셉트'),
      line('이 세계와 이야기를 한 문장으로 설명하면?'),
      heading(2, '세계의 기본 규칙'),
      line('이 세계에서 반드시 지켜지는 규칙은?'),
      heading(2, '배경'),
      line('시대:'),
      line('장소:'),
      line('사회 구조:'),
      line('기술 / 마법 / 능력 체계:'),
      heading(2, '금기와 비밀'),
      line('인물들이 모르거나 말하지 못하는 핵심 진실은?'),
      heading(2, '주요 세력'),
      line('세력 1:'),
      line('세력 2:'),
      line('세력 3:'),
      heading(2, '갈등 구조'),
      line('이 세계에서 반복적으로 충돌하는 가치는?'),
      heading(2, '주인공이 세계와 만나는 방식'),
      line('주인공은 이 세계의 규칙을 어떻게 경험하고 바꾸는가?'),
      heading(2, '독자에게 보여줄 장면'),
      line('이 세계관의 매력을 가장 잘 보여주는 장면은?'),
    ]),
  },
];

export function serializeTemplateContent(template: PlanTemplate): string | null {
  if (template.content === null) return null;
  return JSON.stringify(template.content);
}
