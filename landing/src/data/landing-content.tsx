export const PROSE: string[][] = [
  ['연재는 혼자 달리는 긴 레이스입니다.'],
  [
    '인물도 쌓이고, 설정도 쌓이고, 독자의 기다림도 쌓입니다.',
    '매주 마감은 돌아오고, 어느 날은 글쓰기보다 기억하는 데에 더 많은 시간을 씁니다.',
  ],
  ['그 사이에서 가장 먼저 지치는 건 늘 작가님입니다.'],
  [
    '그 시간을 돌려드리고 싶었습니다.',
    '작가님은 쓰는 일에만 집중하실 수 있도록.',
  ],
];

export const DEDICATION: string[] = ['이 작업실을 드립니다.'];

export type ToolMockupKey = 'devicesync' | 'editor' | 'aistudio';

export type Tool = {
  number: string;
  keyword: string;
  oneline: string;
  features: string[];
  mockup: ToolMockupKey;
};

export const TOOLS: Tool[] = [
  {
    number: '01 / 03',
    keyword: '섬세한 AI 도구',
    oneline:
      '쌓인 설정을 바탕으로 검수하고, 다음 화 초안을 만들고, 기존 원고를 정리합니다.',
    features: [
      '설정 기반 원고 검수',
      '설정집 기반 맞춤법 설정',
      '새로운 초안 생성',
      '기존 원고에서 인물·설정 자동 추출',
    ],
    mockup: 'aistudio',
  },
  {
    number: '02 / 03',
    keyword: '언제 어디서나',
    oneline:
      'PC에서 쓰다가 태블릿에서 이어 씁니다. 네트워크가 끊겨도 원고는 이어집니다.',
    features: ['오프라인 작업 지원', '온라인 클라우드 동기화'],
    mockup: 'devicesync',
  },
  {
    number: '03 / 03',
    keyword: '집필 친화적 에디터',
    oneline: '연재에 필요한 구조와 서식을 한 화면에 모았습니다.',
    features: [
      '캐릭터·플롯·원고 등 카테고리 구분',
      '볼드·기울임 등 서식',
      '원고와 설정집을 오가는 분할 작업',
    ],
    mockup: 'editor',
  },
];

export type ExtraTool = {
  num: string;
  title: string;
  desc: string;
  meta: string;
};

export const EXTRA_TOOLS: ExtraTool[] = [
  {
    num: '01',
    title: '회차 요약 생성',
    desc: '회차 본문에서 한 줄 요약, 핵심 사건, 등장인물, 심어진 복선과 회수된 복선을 정리합니다.',
    meta: '회차 흐름 정리',
  },
  {
    num: '02',
    title: '아이디어 노트',
    desc: '떠오르는 아이디어와 장면 조각을 작품 안에 따로 모아두고, 필요할 때 다시 꺼내 씁니다.',
    meta: '작품별 아카이브',
  },
  {
    num: '03',
    title: '복선 관리',
    desc: '심어둔 복선을 기록하고 회차나 플롯과 연결해, 어디에서 등장하고 회수되는지 관리합니다.',
    meta: '복선 타임라인',
  },
  {
    num: '04',
    title: '보조 작업 창',
    desc: '설정집, 등장인물, 세계관, 이전 원고를 옆에 띄워두고 원고 흐름을 끊지 않은 채 참조합니다.',
    meta: '분할 화면',
  },
  {
    num: '05',
    title: '테마 전환',
    desc: '밝기와 색감이 다른 6가지 테마로, 작업 시간과 눈의 피로도에 맞춰 집필 환경을 바꿉니다.',
    meta: '6가지 색상 테마',
  },
  {
    num: '06',
    title: '설정집 내보내기',
    desc: '기획, 인물, 세계관, 플롯, 복선, 아이디어를 묶어 외부에서도 읽기 좋게 정리합니다.',
    meta: '설정 자료 정리',
  },
];

export type FlowStep = {
  num: string;
  label: string;
  body: string;
};

export const STEPS: FlowStep[] = [
  {
    num: 'Step 01',
    label: '설정',
    body: '인물·세계관·용어를 설정집에 등록하거나 기존 원고를 불러옵니다',
  },
  {
    num: 'Step 02',
    label: '집필',
    body: '에디터에서 쓰면 자동 저장되고 설정집 기반 맞춤법이 함께 보정됩니다',
  },
  {
    num: 'Step 03',
    label: '정리',
    body: '원고에서 요약·인물·복선을 추출해 작품 지식 베이스로 정리합니다',
  },
  {
    num: 'Step 04',
    label: '검수·초안',
    body: '설정 충돌과 맞춤법을 확인하고 다음 화 초안을 생성합니다',
  },
];

export type PricingCard = {
  name: string;
  price: string;
  period: string;
  sub: string;
  cta: string;
  ctaVariant: 'primary' | 'ghost';
  featured: boolean;
  features: string[];
};

export const PRICING: PricingCard[] = [
  {
    name: '무료',
    price: '0원',
    period: '',
    sub: '영구 무료 · 카드 불필요',
    cta: '시작하기',
    ctaVariant: 'ghost',
    featured: false,
    features: [
      '작품 5개까지 작성',
      '클라우드 동기화 100MB\n(약 1,000만 자, 2000편 분량)',
      '집필 친화 에디터',
      '설정집 · 아이디어 노트',
      '100 크레딧 무료 지급 (가입 시)',
      '└ AI 검수 약 3회 또는 초안 약 2회',
    ],
  },
  {
    name: '프로',
    price: '19,800원',
    period: '/월',
    sub: '매달 25,000 크레딧 자동 충전',
    cta: '구독 시작',
    ctaVariant: 'primary',
    featured: true,
    features: [
      '무료 플랜 모든 기능 포함',
      '클라우드 동기화 용량 무제한',
      '매달 25,000 크레딧 자동 충전',
      '└ AI 검수 무제한급 (하루 10회 이상)',
      '└ AI 초안 생성 매일 사용 가능 (월 100회+)',
    ],
  },
];

export type CreditPack = {
  price: string;
  credit: string;
  bonus: string;
};

export const CREDIT_PACKS: CreditPack[] = [
  { price: '3,000원', credit: '3,000 CR', bonus: '검수 10회' },
  { price: '5,000원', credit: '5,500 CR', bonus: '검수 18회' },
  { price: '10,000원', credit: '12,000 CR', bonus: '검수 41회' },
];

export type FAQItem = {
  q: string;
  short: string;
  a: string;
};

export const FAQ: FAQItem[] = [
  {
    q: '150화 이상 쓴 작품도 가져올 수 있나요?',
    short: '150화 이하 품질 보장.',
    a: '이미 써둔 원고를 가져오는 것은 가능하지만, 분량이 많이 쌓인 작품일수록 자동 추출 품질이 달라질 수 있어 "품질 보장" 대상은 150화 이하입니다. Folio와 함께 쌓았다면 그 이상도 유지됩니다.',
  },
  {
    q: '원고를 다른 플랫폼에 올릴 수 있나요?',
    short: '언제든 가능합니다.',
    a: '작성하신 원고는 TXT · DOCX · Markdown 등 표준 포맷으로 언제든 내보낼 수 있습니다. 문피아 · 카카오페이지 · 네이버 시리즈 등 어느 플랫폼에든 복사해서 올리시면 됩니다. 원고는 Folio에 묶여 있지 않습니다.',
  },
  {
    q: 'AI 초안의 저작권은 누구에게 있나요?',
    short: '전부 작가님께 있습니다.',
    a: 'Folio는 작가님의 설정·요약·원고를 참조해 초안을 생성하는 도구입니다. 최종 선택과 수정은 작가님이 하시고, 결과물의 저작권과 사용 권한은 모두 작가님께 귀속됩니다. Folio는 어떤 권리도 주장하지 않습니다.',
  },
  {
    q: '구독 해지하면 데이터는?',
    short: '보존 · 무료 플랜 전환.',
    a: '원고·설정집·요약·아카이브는 그대로 남고 무료 플랜으로 전환됩니다. AI 기능만 토큰이 떨어지면 중단돼요. 전체 내보내기·완전 삭제도 언제든 가능합니다.',
  },
];
