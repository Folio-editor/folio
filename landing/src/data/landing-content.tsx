import type { ReactNode } from 'react';

export const PROSE: string[][] = [
  ['백 번째 화를 쓰고 있었다.'],
  [
    '주인공의 이름이 기억나지 않았다.',
    '아니, 이 이름이 맞긴 한 건지 확신이 없었다.',
  ],
  [
    '삼십 화 전에 흘려놓은 떡밥은 어디로 갔더라.',
    '그녀가 사랑하는 건 누구였더라.',
    '그녀가 정말 — 사랑한 적이 있긴 했던가.',
  ],
  ['커서가 깜박였다.', '모니터 위에서, 백지 위에서, 기억 속에서.'],
  ['그때, 옆에서 조용한 목소리가 들려왔다.'],
];

export const WHISPER: string[] = [
  '"32화에서 그녀는 이렇게 말했어요.',
  '나는 당신을 기다릴 거예요, 라고."',
];

export type ToolMockupKey = 'aiinspection' | 'spellcheck' | 'importorganize';

export type Tool = {
  number: string;
  keyword: string;
  oneline: string;
  metric: ReactNode;
  mockup: ToolMockupKey;
};

export const TOOLS: Tool[] = [
  {
    number: '01 / 03',
    keyword: 'AI 검수',
    oneline: '쌓인 지식 베이스로 설정 충돌을 미리 잡습니다.',
    metric: (
      <>
        설정·캐릭터·떡밥 <strong>자동 대조</strong>
      </>
    ),
    mockup: 'aiinspection',
  },
  {
    number: '02 / 03',
    keyword: '설정 인식 맞춤법',
    oneline: '인물·지명·고유명사를 오타로 잡지 않습니다.',
    metric: (
      <>
        오타의 <strong>58%</strong>가 캐릭터 이름 → 자동 제외
      </>
    ),
    mockup: 'spellcheck',
  },
  {
    number: '03 / 03',
    keyword: '원고 임포트 자동 정리',
    oneline:
      '기존 원고를 등록하면 인물·지명·떡밥이 설정집에 자동으로 정리됩니다.',
    metric: (
      <>
        <strong>150화 이하</strong> 품질 보장 · 그 이상도 가능
      </>
    ),
    mockup: 'importorganize',
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
    num: '04',
    title: '자동 회차 요약',
    desc: '저장하면 3~5문장으로 이 화가 무슨 얘기였는지 정리됩니다. 30화 뒤에도 뒤적거리지 않아요.',
    meta: '매 회차 · 자동',
  },
  {
    num: '05',
    title: 'AI 초안 생성',
    desc: '축적된 설정과 최근 화를 참조해 다음 화 초안을 작가의 말투 그대로 2~3개 만듭니다.',
    meta: '토큰 소모 · 프로 권장',
  },
  {
    num: '06',
    title: '떡밥 추적',
    desc: '언제 뿌린 떡밥인지, 몇 화째 미회수인지 한눈에. 독자 이탈 전에 정리하세요.',
    meta: '누적 타임라인',
  },
  {
    num: '07',
    title: '문장 아카이브',
    desc: '마음에 든 문장은 저장해두고, 나중에 검색해서 다시 꺼내 쓰세요. 작가의 스타일 DB.',
    meta: '무제한 저장',
  },
  {
    num: '08',
    title: '버전 히스토리',
    desc: '저장 시점마다 자동 기록. 어제 썼던 문단으로 되돌리거나 두 버전을 나란히 비교할 수 있어요.',
    meta: '자동 저장 · 무제한',
  },
  {
    num: '09',
    title: '다중 기기 동기화',
    desc: 'PC에서 쓰다가 태블릿·폰에서 이어서. 오프라인에서 쓴 내용도 자동으로 동기화됩니다.',
    meta: '실시간 · 오프라인 대응',
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
    label: '등록',
    body: '설정집에 인물·세계관 입력 (또는 기존 원고 임포트)',
  },
  {
    num: 'Step 02',
    label: '집필',
    body: '에디터 + 자동 저장 + 실시간 맞춤법',
  },
  {
    num: 'Step 03',
    label: '분석',
    body: '요약·인물·떡밥 자동 추출 → 지식 베이스',
  },
  {
    num: 'Step 04',
    label: '검수·초안',
    body: '설정 충돌 체크 + 다음 화 초안 생성',
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
      '에디터 무제한',
      '설정 인식 맞춤법',
      '설정집 · 아카이브',
      '토큰 500/월 (맛보기)',
    ],
  },
  {
    name: '프로',
    price: '9,900원',
    period: '/월',
    sub: '매월 토큰 25,000 자동 충전',
    cta: '구독 시작',
    ctaVariant: 'primary',
    featured: true,
    features: [
      '무료 플랜 전체 포함',
      '토큰 25,000/월',
      '초안 15회 + 검수 80회',
      'AI 우선 처리',
    ],
  },
];

export type FAQItem = {
  q: string;
  short: string;
  a: string;
};

export const FAQ: FAQItem[] = [
  {
    q: 'AI 학습에 사용되나요?',
    short: '사용되지 않습니다.',
    a: 'Folio가 호출하는 OpenAI · Anthropic API는 호출 데이터를 모델 학습에 사용하지 않는 것이 기본 정책이며, 저희도 작가 데이터를 학습용으로 수집·활용하지 않습니다.',
  },
  {
    q: '150화 이상 작품도 임포트 가능?',
    short: '150화 이하 품질 보장.',
    a: '임포트 동작은 가능하지만, 이미 축적된 작품일수록 자동 추출 품질이 달라질 수 있어 "품질 보장" 대상은 150화 이하입니다. 1화부터 Folio와 함께 쌓았다면 그 이상도 유지됩니다.',
  },
  {
    q: '오프라인 집필 가능?',
    short: '에디터는 OK, AI는 온라인.',
    a: '에디터는 브라우저 캐시로 오프라인에서도 계속 쓸 수 있고 자동 동기화됩니다. AI 기능(초안·검수·요약)은 서버 호출이 필요해 온라인에서만 작동합니다.',
  },
  {
    q: '구독 해지하면 데이터는?',
    short: '보존 · 무료 플랜 전환.',
    a: '원고·설정집·요약·아카이브는 그대로 남고 무료 플랜으로 전환됩니다. AI 기능만 토큰이 떨어지면 중단돼요. 전체 내보내기·완전 삭제도 언제든 가능합니다.',
  },
];
