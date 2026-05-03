import type { ReactNode } from 'react';
import type { Activity } from '../types/workspace';
import type { HelpStep } from '../components/ui/FloatingHelpCard';

interface TabHelp {
  /** 카드 헤더에 표시되는 제목 */
  title: string;
  /** 1~N 페이지의 도움말 */
  steps: HelpStep[];
}

// ── 인라인 헬퍼 — 자주 쓰는 강조 패턴 ─────────────────────────
function K({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex items-center rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
      {children}
    </kbd>
  );
}
function H({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-foreground">{children}</strong>;
}

// ── 8개 활동 탭별 도움말 ────────────────────────────────────
const HELP: Partial<Record<Activity, TabHelp>> = {
  home: {
    title: '작품 홈',
    steps: [
      {
        title: '여러 작품 관리',
        body: (
          <p>
            왼쪽 사이드바에 모든 작품이 표시됩니다. <H>작품 카드를 클릭</H>하면 그 작품의
            워크스페이스로 진입해요. 새 작품을 만들려면 사이드바 상단의 <H>＋ 새 작품</H>
            버튼을 누르세요.
          </p>
        ),
      },
      {
        title: '작품 정보 한눈에',
        body: (
          <>
            <p>작품 홈 화면에서 다음을 한 번에 관리할 수 있어요:</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li>작품 제목·작가명·시놉시스</li>
              <li>장르·분위기 태그</li>
              <li>전체 회차 수·총 글자 수 통계</li>
            </ul>
          </>
        ),
      },
      {
        title: '휴지통과 복원',
        body: (
          <p>
            작품을 삭제하면 30일간 <H>휴지통</H>에 보관됩니다. 좌측 활동 바의 휴지통 아이콘에서
            언제든 복원하거나 영구 삭제할 수 있어요.
          </p>
        ),
      },
    ],
  },

  episode: {
    title: '회차 / 원고',
    steps: [
      {
        title: '회차 작성',
        body: (
          <>
            <p>
              사이드바에서 회차를 더블클릭하거나 <H>＋ 새 회차</H>로 추가하세요. 본문은 위지윅
              에디터로 작성하며, <H>3초마다 자동 저장</H>됩니다.
            </p>
            <p className="mt-2 text-muted-foreground">
              저장 상태는 하단 상태 바에서 확인할 수 있어요.
            </p>
          </>
        ),
      },
      {
        title: '에디터 단축키',
        body: (
          <ul className="space-y-1.5">
            <li>
              <K>Ctrl</K> + <K>B</K> 굵게 / <K>Ctrl</K> + <K>I</K> 기울임
            </li>
            <li>
              <K>Ctrl</K> + <K>Shift</K> + <K>H</K> 형광펜
            </li>
            <li>
              <K>Ctrl</K> + <K>Shift</K> + <K>M</K> 주석 (작가 메모, AI 가 보지 않음)
            </li>
            <li>
              <K>Ctrl</K> + <K>F</K> 본문 검색
            </li>
            <li>
              <K>Tab</K> 들여쓰기 / 따옴표·괄호 안에서는 닫는 기호로 점프
            </li>
          </ul>
        ),
      },
      {
        title: '주석과 형광펜',
        body: (
          <>
            <p>
              본문에 <H>형광펜 8색</H>으로 강조 마킹을, <H>주석</H>으로 작가 전용 메모를 남길 수
              있어요. 주석은 점선 밑줄로 표시되며 AI 검수·내보내기에서 자동 제외됩니다.
            </p>
            <p className="mt-2 text-muted-foreground">
              툴바의 형광펜 버튼을 누르면 색상 팔레트가 열려요.
            </p>
          </>
        ),
      },
      {
        title: 'AI 검수',
        body: (
          <p>
            우측 패널의 <H>AI 도구</H> 탭에서 회차 검수와 초안 생성을 사용할 수 있어요. 검수는
            맞춤법·일관성·캐릭터 톤을 분석해 줄 단위로 이슈를 표시합니다. 사용량은 좌하단 잔여
            크레딧에 즉시 반영돼요.
          </p>
        ),
      },
    ],
  },

  plot: {
    title: '플롯',
    steps: [
      {
        title: '막 / 회차 2단 구조',
        body: (
          <p>
            플롯은 <H>막(Act)</H> 아래에 <H>회차(Episode)</H>가 들어가는 2단 구조예요. 막을
            먼저 만들고, 그 안에 회차를 추가해 줄거리를 구성합니다.
          </p>
        ),
      },
      {
        title: '회차 ↔ 원고 연결',
        body: (
          <p>
            플롯의 회차와 실제 원고(Episode 탭)는 별개의 도메인이에요. 플롯에서 만든 회차 시놉시스를
            원고로 옮기려면 회차 카드의 <H>↗ 원고 연결</H> 버튼을 사용하세요.
          </p>
        ),
      },
      {
        title: '드래그로 순서 변경',
        body: (
          <p>
            막과 회차 모두 <H>드래그하여 순서</H>를 바꿀 수 있어요. 막 사이로 회차를 옮기면 다른
            막 소속이 됩니다.
          </p>
        ),
      },
    ],
  },

  character: {
    title: '등장인물',
    steps: [
      {
        title: '캐릭터 통합 뷰',
        body: (
          <p>
            한 캐릭터의 <H>프로필 + 외형 + 성격 + 사용자 정의 노트</H>를 한 화면에서 함께 편집할
            수 있어요. 사이드바에서 캐릭터를 클릭하면 통합 뷰로 진입합니다.
          </p>
        ),
      },
      {
        title: '기본 노트와 사용자 노트',
        body: (
          <ul className="list-disc space-y-1 pl-4">
            <li>
              <H>캐릭터 개요</H> — 캐릭터 생성 시 자동 추가, 삭제 불가
            </li>
            <li>
              <H>사용자 노트</H> — 자유롭게 추가·삭제. 외형·성격·동기·관계·비밀 등을 따로 정리
            </li>
          </ul>
        ),
      },
      {
        title: '세계관 태그',
        body: (
          <p>
            캐릭터 프로필에서 <H>세계관 노트를 태그</H>로 연결할 수 있어요. 예를 들어 캐릭터가
            속한 조직·지역을 태그하면 캐릭터-세계관 양쪽에서 상호 참조됩니다.
          </p>
        ),
      },
    ],
  },

  'world-note': {
    title: '세계관',
    steps: [
      {
        title: '카테고리 자유 구성',
        body: (
          <p>
            세계관 탭은 빈 상태로 시작해요. 필요한 만큼 노트를 직접 추가하세요.{' '}
            <H>시대/배경 · 공간/지리 · 세력/조직 · 규칙/법칙 · 역사/연표</H> 같은 카테고리로
            나눠 시작하면 정리하기 편해요.
          </p>
        ),
      },
      {
        title: '무제한 깊이 트리',
        body: (
          <p>
            세계관 노트는 <H>부모-자식 트리</H>로 무제한 중첩됩니다. 예: "공간/지리 → 하르핀 시 →
            구도심 거리". 통합 뷰에서 모든 깊이의 노트를 한눈에 편집할 수 있어요.
          </p>
        ),
      },
      {
        title: '드래그로 재구성',
        body: (
          <p>
            노트 카드를 드래그하여 다른 부모 아래로 옮기거나 형제 사이 순서를 조절할 수 있어요.
            특정 노트 위로 드롭하면 자식이 됩니다.
          </p>
        ),
      },
    ],
  },

  foreshadow: {
    title: '복선',
    steps: [
      {
        title: '복선 생애주기',
        body: (
          <ul className="list-disc space-y-1 pl-4">
            <li>
              <H>심기</H> — 독자에게 단서를 처음 노출
            </li>
            <li>
              <H>전개</H> — 단서를 강화하거나 다른 각도에서 다시 등장
            </li>
            <li>
              <H>회수</H> — 진실이 밝혀지는 결정적 장면
            </li>
          </ul>
        ),
      },
      {
        title: '중요도와 상태',
        body: (
          <p>
            복선마다 <H>중요도(상/중/하)</H>와 <H>상태</H>를 기록할 수 있어요. 회수되지 않은
            복선은 한 화면에서 추적·관리됩니다.
          </p>
        ),
      },
      {
        title: '회차·플롯과 연결',
        body: (
          <p>
            복선이 등장한 회차·플롯을 직접 링크하면 작품 진행 시 자동으로 어디서 등장했는지 추적할
            수 있어요.
          </p>
        ),
      },
    ],
  },

  plan: {
    title: '기획',
    steps: [
      {
        title: '작품 한 편당 기획서 1개',
        body: (
          <p>
            작품의 <H>핵심 컨셉·시놉시스·메인 갈등·타겟 독자</H>를 정리하는 공간이에요. 자유로운
            노트 형식으로 한 작품에 여러 기획 노트를 추가할 수도 있습니다.
          </p>
        ),
      },
      {
        title: '시놉시스를 먼저',
        body: (
          <p>
            시놉시스를 한두 단락으로 먼저 적은 뒤, 메인 갈등과 캐릭터 동기를 정리하면 회차 작성이
            쉬워져요. 작가 메모(<K>Ctrl</K> + <K>Shift</K> + <K>M</K>)로 자기 메모를 남기세요.
          </p>
        ),
      },
    ],
  },

  'idea-archive': {
    title: '아이디어 아카이브',
    steps: [
      {
        title: '단상을 빠르게 보관',
        body: (
          <p>
            작품 진행 중 떠오른 짧은 아이디어·대사·장면을 <H>태그</H>와 함께 빠르게 저장해요.
            나중에 회차 작성 시 검색해서 가져올 수 있습니다.
          </p>
        ),
      },
      {
        title: '태그로 분류',
        body: (
          <p>
            <H>캐릭터 / 장면 / 대사 / 설정</H> 등 자유 태그로 분류하세요. 태그 칩을 클릭하면 같은
            태그의 아이디어만 필터링됩니다.
          </p>
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
