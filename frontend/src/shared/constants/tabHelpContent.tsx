import type { ReactNode } from 'react';
import type { Activity } from '../types/workspace';
import type { HelpStep } from '../components/ui/FloatingHelpCard';

interface TabHelp {
  /** 카드 헤더에 표시되는 제목 */
  title: string;
  /** 1~N 페이지의 도움말 */
  steps: HelpStep[];
}

// ── 인라인 헬퍼 — Folio 모달 공통 토큰 ────────────────────────
function K({ children }: { children: ReactNode }) {
  return (
    <kbd
      className="inline-flex items-center rounded-[3px] border border-[#d4d4d4] border-b-[1.5px] bg-white px-1.5 text-[10px] text-[#111] mx-[1px]"
      style={{
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        height: '18px',
      }}
    >
      {children}
    </kbd>
  );
}

function H({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-[#111]">{children}</strong>;
}

function GuideBox({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-3 rounded-[6px] border border-[#d4d4d4] bg-white px-3.5 py-2.5">
      <p className="m-0 mb-1.5 flex items-center gap-2 text-[9.5px] font-medium uppercase tracking-[0.28em] text-[#6b6b6b]">
        {label}
        <span aria-hidden className="flex-1 h-px bg-[#e5e5e2]" />
      </p>
      <div className="text-[12px] leading-[1.7] text-[#111]">{children}</div>
    </div>
  );
}

// ── 8개 활동 탭별 도움말 ────────────────────────────────────
const HELP: Partial<Record<Activity, TabHelp>> = {
  home: {
    title: '작품 홈',
    steps: [
      {
        title: '처음엔 여기부터',
        body: (
          <>
            <p>
              작품 홈은 이 작품의 <H>출발점</H>이에요. 새 작품을 만들었다면 먼저 제목,
              작가명, 한 줄 소개를 정리해 두세요. 이후 기획, 설정, 원고 작업의 기준이
              됩니다.
            </p>
            <GuideBox label="추천 순서">
              <ol className="list-decimal space-y-1 pl-4">
                <li>작품 제목과 소개를 먼저 적기</li>
                <li>장르·분위기 태그 붙이기</li>
                <li>기획 탭으로 넘어가 시놉시스 정리하기</li>
              </ol>
            </GuideBox>
          </>
        ),
      },
      {
        title: '이 화면에서 무엇을 보나요?',
        body: (
          <>
            <p>
              작품 홈에서는 <H>작품 정보</H>와 <H>작업 현황</H>을 한눈에 확인할 수
              있어요. 각 카드에서 기획, 세계관, 등장인물, 플롯, 원고로 바로 이동합니다.
            </p>
            <GuideBox label="홈에서 자주 확인하는 것">
              <ul className="list-disc space-y-1 pl-4">
                <li>작품 제목·작가명·시놉시스</li>
                <li>장르·분위기 태그</li>
                <li>회차 수와 글자 수 같은 기본 통계</li>
              </ul>
            </GuideBox>
          </>
        ),
      },
      {
        title: '정리와 복원',
        body: (
          <>
            <p>
              작품을 삭제해도 바로 사라지지 않고 <H>30일 동안 휴지통</H>에 보관돼요.
              실수로 지웠다면 좌측 활동 바의 휴지통에서 복원하면 됩니다.
            </p>
            <GuideBox label="기억해두면 좋아요">
              <p>
                홈은 작성 화면이라기보다 <H>관리 화면</H>에 가까워요. 집필은 회차/원고,
                구조 설계는 플롯, 설정 정리는 세계관·등장인물에서 이어서 작업하세요.
              </p>
            </GuideBox>
          </>
        ),
      },
    ],
  },

  episode: {
    title: '회차 / 원고',
    steps: [
      {
        title: '+ 새 원고부터',
        body: (
          <>
            <p>
              왼쪽 <H>+ 새 원고</H>를 눌러 회차를 만든 뒤, 제목과 본문을 바로 입력하세요.
              이미 만든 회차는 <H>제목 클릭</H>으로 다시 열 수 있어요.
            </p>
            <GuideBox label="바로 하기">
              <ol className="list-decimal space-y-1 pl-4">
                <li>`+ 새 원고` 누르기</li>
                <li>회차 제목 적기</li>
                <li>본문 초고 쓰기</li>
              </ol>
            </GuideBox>
          </>
        ),
      },
      {
        title: '우측 AI 도구 쓰기',
        body: (
          <>
            <p>
              초고를 쓴 뒤 우측 <H>AI 도구</H>를 열어 검수나 보조 작성을 쓰세요. 고민되는
              문장은 <H>형광펜</H>이나 <H>주석</H>으로 먼저 표시해 두면 편합니다.
            </p>
            <GuideBox label="자주 씀">
              <ul className="space-y-1.5">
                <li>
                  <K>Ctrl</K> + <K>Shift</K> + <K>H</K> 형광펜
                </li>
                <li>
                  <K>Ctrl</K> + <K>Shift</K> + <K>M</K> 작가 메모
                </li>
                <li>
                  <K>Ctrl</K> + <K>F</K> 본문 검색
                </li>
              </ul>
            </GuideBox>
          </>
        ),
      },
      {
        title: '저장은 아래에서 확인',
        body: (
          <>
            <p>
              저장 상태와 동기화 상태는 <H>하단 상태 바</H>에서 확인할 수 있어요.
              `저장됨`을 보고 다음 회차로 넘어가면 됩니다.
            </p>
            <GuideBox label="흐름">
              <p>
                회차 생성 → 초고 작성 → 형광펜/주석 표시 → AI 도구 검수
              </p>
            </GuideBox>
          </>
        ),
      },
    ],
  },

  plot: {
    title: '플롯',
    steps: [
      {
        title: '+ 새 막으로 시작',
        body: (
          <>
            <p>
              플롯은 <H>막</H> 아래에 <H>회차</H>를 넣는 구조예요. 먼저 `도입`, `중반`,
              `후반`처럼 큰 흐름부터 나눠 보세요.
            </p>
            <GuideBox label="바로 하기">
              <ol className="list-decimal space-y-1 pl-4">
                <li>`+ 새 막`으로 큰 흐름 만들기</li>
                <li>각 막 안에 회차 추가하기</li>
                <li>회차마다 한 줄 줄거리 적기</li>
              </ol>
            </GuideBox>
          </>
        ),
      },
      {
        title: '회차 만들고 원고 연결',
        body: (
          <>
            <p>
              플롯은 줄거리 설계, 원고는 실제 집필 화면이에요. 회차 카드의
              <H> ↗ 원고 연결</H>을 누르면 바로 집필 탭으로 넘어갑니다.
            </p>
            <GuideBox label="핵심">
              <p>플롯은 설계, 원고는 집필이라고 생각하면 가장 쉽습니다.</p>
            </GuideBox>
          </>
        ),
      },
      {
        title: '순서는 드래그',
        body: (
          <>
            <p>
              막과 회차는 모두 <H>드래그</H>로 순서를 바꿀 수 있어요. 회차를 다른 막으로
              끌어다 놓으면 소속도 함께 바뀝니다.
            </p>
          </>
        ),
      },
    ],
  },

  character: {
    title: '등장인물',
    steps: [
      {
        title: '+ 새 인물부터',
        body: (
          <>
            <p>
              처음에는 모든 인물을 만들지 말고 <H>주인공 1명</H>부터 시작하세요.
              <H>+ 새 인물</H>을 누른 뒤 이름, 소개, 성격만 먼저 적으면 됩니다.
            </p>
            <GuideBox label="먼저 적기">
              <ul className="list-disc space-y-1 pl-4">
                <li>이름</li>
                <li>한 줄 소개</li>
                <li>성격 또는 말투</li>
              </ul>
            </GuideBox>
          </>
        ),
      },
      {
        title: '이름 클릭하면 상세 편집',
        body: (
          <>
            <p>
              왼쪽 목록에서 캐릭터 이름을 클릭하면 <H>프로필, 외형, 성격, 사용자 노트</H>를
              한 화면에서 함께 편집할 수 있어요.
            </p>
            <GuideBox label="나눠 쓰기">
              <ul className="list-disc space-y-1 pl-4">
                <li>
                  <H>기본 항목</H>: 소개, 외형, 성격
                </li>
                <li>
                  <H>사용자 노트</H>: 관계, 비밀, 서사 메모
                </li>
              </ul>
            </GuideBox>
          </>
        ),
      },
      {
        title: '소속은 태그로 연결',
        body: (
          <>
            <p>
              캐릭터에 조직, 지역, 능력 같은 설정이 있다면 <H>세계관 태그</H>를 붙여두세요.
              나중에 관련 설정을 다시 찾기가 쉬워집니다.
            </p>
          </>
        ),
      },
    ],
  },

  'world-note': {
    title: '세계관',
    steps: [
      {
        title: '기본 문서 하나부터',
        body: (
          <>
            <p>
              새 작품에는 <H>시대/배경, 공간/지리, 세력/조직, 규칙/법칙, 역사/연표</H>가
              자동으로 만들어져요. 먼저 필요한 문서 하나만 골라 채우면 됩니다.
            </p>
            <GuideBox label="추천 순서">
              <ol className="list-decimal space-y-1 pl-4">
                <li>시대/배경</li>
                <li>공간/지리</li>
                <li>세력/조직</li>
              </ol>
            </GuideBox>
          </>
        ),
      },
      {
        title: '+ 새 문서로 하위 추가',
        body: (
          <>
            <p>
              세계관은 <H>부모-자식 구조</H>로 확장돼요. 예를 들어 `공간/지리 → 수도 →
              북부 구역`처럼 큰 설정 아래 세부 문서를 추가할 수 있습니다.
            </p>
          </>
        ),
      },
      {
        title: '드래그로 정리',
        body: (
          <>
            <p>
              문서는 <H>드래그</H>로 다른 부모 아래로 옮길 수 있어요. 구조가 바뀌어도 다시
              정리하기 쉽습니다.
            </p>
          </>
        ),
      },
    ],
  },

  foreshadow: {
    title: '복선',
    steps: [
      {
        title: '+ 새 복선부터',
        body: (
          <>
            <p>
              복선 하나당 카드 하나를 만든다고 생각하면 쉬워요. <H>+ 새 복선</H>을 누른 뒤
              단서 이름과 첫 등장 회차부터 적어두세요.
            </p>
            <GuideBox label="바로 적기">
              <ul className="list-disc space-y-1 pl-4">
                <li>복선 제목</li>
                <li>처음 등장한 회차</li>
                <li>짧은 설명</li>
              </ul>
            </GuideBox>
          </>
        ),
      },
      {
        title: '상태는 심기 → 전개 → 회수',
        body: (
          <>
            <p>
              복선은 보통 <H>심기</H>, <H>전개</H>, <H>회수</H> 순서로 관리해요. 진행될 때마다
              상태를 바꿔두면 미회수 복선을 놓치지 않기 쉽습니다.
            </p>
          </>
        ),
      },
      {
        title: '회차와 플롯 연결',
        body: (
          <>
            <p>
              복선이 등장한 회차나 플롯을 연결해 두면 “어디서 심었는지”를 다시 찾는 시간이
              줄어듭니다.
            </p>
          </>
        ),
      },
    ],
  },

  plan: {
    title: '기획',
    steps: [
      {
        title: '기획서 한 장 먼저',
        body: (
          <>
            <p>
              기획 탭은 작품 방향을 잡는 곳이에요. 먼저 <H>기획서 한 장</H>에 컨셉과
              시놉시스만 적어두면 이후 작업이 훨씬 쉬워집니다.
            </p>
            <GuideBox label="먼저 적기">
              <ol className="list-decimal space-y-1 pl-4">
                <li>한 문장 소개</li>
                <li>짧은 시놉시스</li>
                <li>주인공의 목표</li>
              </ol>
            </GuideBox>
          </>
        ),
      },
      {
        title: '막히면 이 3개 확인',
        body: (
          <>
            <ul className="list-disc space-y-1 pl-4">
              <li>주인공은 무엇을 원하나요?</li>
              <li>무엇이 그걸 막고 있나요?</li>
              <li>왜 지금 이야기가 시작되나요?</li>
            </ul>
          </>
        ),
      },
    ],
  },

  'idea-archive': {
    title: '아이디어 아카이브',
    steps: [
      {
        title: '생각나면 바로 입력',
        body: (
          <>
            <p>
              아이디어 탭은 완성본이 아니라 <H>메모 보관함</H>이에요. 떠오른 대사, 장면,
              설정 한 줄을 짧게 적고 바로 저장하면 됩니다.
            </p>
            <GuideBox label="메모 예시">
              <ul className="list-disc space-y-1 pl-4">
                <li>대사 한 줄</li>
                <li>장면 한 컷</li>
                <li>설정 아이디어</li>
              </ul>
            </GuideBox>
          </>
        ),
      },
      {
        title: '태그와 검색으로 꺼내쓰기',
        body: (
          <>
            <p>
              <H>캐릭터 / 장면 / 대사 / 설정</H> 같은 태그를 붙여두면 나중에 회차를 쓸 때
              필요한 메모만 빠르게 찾을 수 있어요.
            </p>
          </>
        ),
      },
    ],
  },
};

// trash, settings 는 도움말 미제공 — 자동으로 ? 버튼 미노출
export const TAB_HELP: Partial<Record<Activity, TabHelp>> = HELP;

/** 해당 activity 의 도움말이 정의돼 있는지 */
export function hasTabHelp(activity: Activity): boolean {
  return TAB_HELP[activity] !== undefined;
}

/**
 * 모든 탭 도움말의 "1회 자동 노출" 플래그(localStorage)를 삭제.
 * 튜토리얼 가이드 다시 시작 시 호출 — 다음 진입한 탭부터 도움말이 다시 자동으로 1회 뜨도록 함.
 */
export function resetTabHelpShownFlags(): void {
  for (const activity of Object.keys(TAB_HELP) as Activity[]) {
    localStorage.removeItem(`folio.tabHelp.${activity}.shown`);
  }
}
