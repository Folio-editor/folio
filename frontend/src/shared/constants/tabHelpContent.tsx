import type { ReactNode } from 'react';
import type { Activity, RightPanelTab } from '../types/workspace';
import type { HelpStep } from '../components/ui/FloatingHelpCard';

// 도움말 step 본문에서 사용할 수 있는 이미지 헬퍼.
// 사용 예 (라이트/다크 페어):
//   import addActLight from '../assets/images/help/plot/add-act.light.png';
//   import addActDark  from '../assets/images/help/plot/add-act.dark.png';
//   body: (<><HelpImage light={addActLight} dark={addActDark} alt="..." caption="..." /> ...</>)
// HelpImage 는 useResolvedTheme 으로 현재 테마에 맞는 이미지를 자동 선택하고, 클릭 시 확대(라이트박스).
export { HelpImage } from '../components/ui/HelpImage';

interface TabHelp {
  /** 카드 헤더에 표시되는 제목 */
  title: string;
  /** 1~N 페이지의 도움말 */
  steps: HelpStep[];
}

// ── 인라인 헬퍼 — Folio 모달 공통 토큰 (다크모드 호환) ────────────────────────
function K({ children }: { children: ReactNode }) {
  return (
    <kbd
      className="inline-flex items-center rounded-[3px] border border-border border-b-[1.5px] bg-background px-1.5 text-[10px] text-foreground mx-px"
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
  return <strong className="font-semibold text-foreground">{children}</strong>;
}

function GuideBox({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-3 rounded-[6px] border border-border bg-muted px-3.5 py-2.5">
      <p className="m-0 mb-1.5 flex items-center gap-2 text-[9.5px] font-medium uppercase tracking-[0.28em] text-muted-foreground">
        {label}
        <span aria-hidden className="flex-1 h-px bg-border" />
      </p>
      <div className="text-[12px] leading-[1.7] text-foreground">{children}</div>
    </div>
  );
}

// ── 8개 활동 탭별 도움말 ────────────────────────────────────
const HELP: Partial<Record<Activity, TabHelp>> = {
  home: {
    title: '작품 홈',
    steps: [
      {
        title: '작품의 고유 공간',
        body: (
          <>
            <p>
              작품 홈은 이 작품의 <H>출발점</H>입니다. 새 작품을 만들었다면 먼저 제목,
              작가명, 소개를 정리해 보세요. 이후 기획, 설정, 원고 작업의 기준이
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
        title: '좋은 작품 홈 활용의 작은 습관',
        body: (
          <>
            <GuideBox label="홈은 관리 화면">
              <p>
                홈은 작성보다는 <H>관리</H>에 가까워요. 집필은 회차/원고, 구조 설계는
                플롯, 설정 정리는 세계관·등장인물에서 이어서 작업하세요.
              </p>
            </GuideBox>
            <GuideBox label="짧게 자주 메타 갱신">
              <p>
                작품 소개·태그는 한 번에 완성하지 마세요. 진행 중에 떠오를 때마다
                <H>한 줄씩</H> 다듬으면 충분합니다.
              </p>
            </GuideBox>
            <GuideBox label="실수로 지워도 괜찮아요">
              <p>
                작품을 삭제해도 <H>30일 동안 휴지통</H>에 보관돼요. 좌측 활동 바의
                휴지통에서 언제든 복원할 수 있습니다.
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
        title: '좋은 회차의 작은 습관',
        body: (
          <>
            <GuideBox label="흐름을 끊지 말 것">
              <p>
                초고 단계에서는 맞춤법·문장 다듬기를 미루세요. <H>한 호흡</H>으로 끝까지
                쓴 뒤, 형광펜으로 의심 가는 곳만 표시해두면 충분합니다.
              </p>
            </GuideBox>
            <GuideBox label="주석은 메모장처럼">
              <p>
                고민되는 장면·복선·자료 조사가 필요한 부분은 <H>주석</H>으로 본문에
                바로 적어두세요. 작가만 보는 메모라 본문 흐름을 흐리지 않아요.
              </p>
            </GuideBox>
            <GuideBox label="저장은 자동, 확인은 하단">
              <p>
                저장·동기화 상태는 <H>하단 상태 바</H>에서 한눈에. `저장됨` 을 보고
                다음 회차로 넘어가면 됩니다.
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
        title: '+ 새 챕터로 시작',
        body: (
          <>
            <p>
              플롯은 <H>챕터</H> 아래에 <H>회차</H>를 넣는 구조예요. 먼저 `도입`, `중반`,
              `후반`처럼 큰 흐름부터 나눠 보세요.
            </p>
            <GuideBox label="바로 하기">
              <ol className="list-decimal space-y-1 pl-4">
                <li>`+ 새 챕터`로 큰 흐름 만들기</li>
                <li>각 챕터 안에 회차 추가하기</li>
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
        title: '좋은 플롯의 작은 습관',
        body: (
          <>
            <GuideBox label="큰 흐름부터 작게">
              <p>
                처음부터 모든 회차를 채우지 마세요. <H>챕터 단위</H>로 큰 흐름만 잡고,
                회차 줄거리는 집필 직전에 한 줄씩 다듬어도 충분해요.
              </p>
            </GuideBox>
            <GuideBox label="순서는 드래그로">
              <p>
                챕터·회차 모두 <H>드래그</H>로 순서를 바꿀 수 있어요. 회차를 다른 챕터로
                끌어다 놓으면 소속도 함께 바뀝니다.
              </p>
            </GuideBox>
            <GuideBox label="설계와 집필은 분리">
              <p>
                플롯에서는 줄거리만, 원고에서는 본문만 다룬다고 생각하면 흐름이
                흩어지지 않아요. <H>↗ 원고 연결</H>로 자유롭게 오갈 수 있습니다.
              </p>
            </GuideBox>
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
        title: '좋은 인물 노트의 작은 습관',
        body: (
          <>
            <GuideBox label="주인공 한 명부터 자세히">
              <p>
                처음부터 모든 인물을 정리하지 마세요. <H>주인공 1명</H>을 먼저 깊게 적고,
                다른 인물은 등장 직전에 한 줄씩 채워도 늦지 않아요.
              </p>
            </GuideBox>
            <GuideBox label="설정은 세계관 태그로">
              <p>
                인물의 조직·지역·능력 같은 정보는 <H>세계관 태그</H>로 연결해 두세요.
                나중에 관련 설정을 다시 찾기가 훨씬 쉬워집니다.
              </p>
            </GuideBox>
            <GuideBox label="변화는 사용자 노트로">
              <p>
                기본 항목(소개·외형·성격) 외에 인물의 <H>변화·비밀·관계</H>는 사용자
                노트로 따로 적어두세요. 회차가 쌓일수록 가장 자주 갱신되는 영역이에요.
              </p>
            </GuideBox>
          </>
        ),
      },
    ],
  },

  'world-note': {
    title: '세계관',
    steps: [
      {
        title: '세계관은 작품의 무대',
        body: (
          <>
            <p>
              세계관 탭은 작품이 펼쳐지는 <H>시간·공간·규칙</H>을 적어두는 곳입니다.
              회차에서 묘사가 흔들리지 않도록, 무대의 뼈대를 한 자리에 모아둡니다.
            </p>
            <GuideBox label="기본 5가지 분류">
              <ul className="list-disc space-y-1 pl-4">
                <li><H>시대/배경</H> — 연대, 사회 분위기, 풍속</li>
                <li><H>공간/지리</H> — 마을, 건물, 자연 명소</li>
                <li><H>세력/조직</H> — 가문, 단체, 학교, 학우 그룹</li>
                <li><H>규칙/법칙</H> — 세계가 작동하는 원리, 마법·기술 체계</li>
                <li><H>역사/연표</H> — 사건의 순서와 인과</li>
              </ul>
            </GuideBox>
          </>
        ),
      },
      {
        title: '하위 문서로 자유롭게 구체화',
        body: (
          <>
            <p>
              상위 문서 아래 <H>+ 하위 문서</H>로 깊이를 더할 수 있어요. 큰 분류만 두고
              필요할 때 자식 문서를 통해 구체화 가능합니다.
            </p>
            <GuideBox label="확장 예시">
              <ul className="list-disc space-y-1 pl-4">
                <li>공간/지리 → 애번리 마을 → 마을 학교</li>
                <li>세력/조직 → 학교 학우들 → 라이벌 그룹</li>
                <li>시대/배경 → 19세기 말 → 종교와 풍속</li>
              </ul>
            </GuideBox>
          </>
        ),
      },
      {
        title: '좋은 세계관 문서의 작은 습관',
        body: (
          <>
            <GuideBox label="필요할 때만 깊게">
              <p>
                모든 분류를 미리 채우지 마세요. 회차에서 <H>실제로 쓰이는 설정</H>만
                먼저 자세히 적고, 나머지는 한 줄 메모로 남겨두면 충분해요.
              </p>
            </GuideBox>
            <GuideBox label="회차와 연결 짓기">
              <p>
                각 문서 끝에 <H>등장 회차</H>를 메모해 두면 좋아요. "이 설정은 어디서
                썼더라?" 다시 찾기가 훨씬 쉬워집니다.
              </p>
            </GuideBox>
            <GuideBox label="이름은 작품의 시그니처">
              <p>
                장소·조직·규칙의 이름은 한 번 정하면 작품 전체에 반복돼요. 처음 지을 때
                조금만 신경 쓰면, 묘사 일관성이 자연스럽게 따라옵니다.
              </p>
            </GuideBox>
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
        title: '좋은 복선의 작은 습관',
        body: (
          <>
            <GuideBox label="얇고 빠르게 심기">
              <p>
                독자가 의식하지 못할 정도로 <H>얇게</H> 심으세요. 회수 시점에 "그러고
                보니" 정도의 인지면 충분해요. 단서가 강하면 트릭의 묘미가 사라집니다.
              </p>
            </GuideBox>
            <GuideBox label="회차·플롯과 연결">
              <p>
                복선이 등장한 회차·플롯을 <H>연결</H>해 두면 "어디서 심었는지" 다시 찾는
                시간이 줄어듭니다. 미회수 복선도 한눈에 점검 가능해요.
              </p>
            </GuideBox>
            <GuideBox label="한 회차에 너무 많지 않게">
              <p>
                한 회차에 새 복선은 <H>1~2개</H>가 적정선이에요. 늘어나면 작가도, 독자도
                잊어버리기 쉬워집니다.
              </p>
            </GuideBox>
          </>
        ),
      },
    ],
  },

  plan: {
    title: '기획',
    steps: [
      {
        title: '기획은 작품의 나침반.',
        body: (
          <>
            <p>
              기획 탭은 작품의 <H>방향과 약속</H>을 적어두는 곳입니다. 회차·세계관·캐릭터
              작업 중 길을 잃었을 때, 돌아와서 "이 작품이 약속한 재미는 뭐였지?" 다시
              확인할 수 있습니다.
            </p>
            <GuideBox label="이런 문서를 만들어요">
              <ul className="list-disc space-y-1 pl-4">
                <li>작품 기획안 — 로그라인, 한 줄 소개, 타깃 독자</li>
                <li>주제·모티프 노트 — 작품 안에서 반복되는 정서와 상징</li>
                <li>시놉시스 / 트리트먼트 — 처음부터 끝까지 큰 흐름</li>
                <li>연재 전략 / 회차 운영 메모 — 분량과 호흡 계획</li>
              </ul>
            </GuideBox>
          </>
        ),
      },
      {
        title: '+ 새 문서로 템플릿 골라 시작',
        body: (
          <>
            <p>
              왼쪽 사이드바의 <H>+ 새 문서</H> 버튼을 누르면 4가지 기본 템플릿이 제공됩니다.
            </p>
            <GuideBox label="4가지 기본 템플릿">
              <ul className="list-disc space-y-1 pl-4">
                <li><H>빈 서식</H> — 자유롭게 시작</li>
                <li><H>기본 작품 기획</H> — 핵심·주인공·갈등을 빠르게</li>
                <li><H>중장편/연재 기획</H> — 초반 후킹·독자 약속·장기 전개</li>
                <li><H>장르/세계관 기획</H> — 세계의 규칙·세력·비밀 중심</li>
              </ul>
            </GuideBox>
            <p className="mt-3">마음에 드는 걸 골라 빈칸을 채우면 쉽게 기획서 한 장이 완성됩니다.</p>
          </>
        ),
      },
      {
        title: '좋은 기획서의 작은 습관',
        body: (
          <>
            <GuideBox label="짧게 자주">
              <p>
                처음부터 완벽하게 채우려 하지 마세요. <H>한 줄</H>이라도 먼저 적고,
                회차를 쓰면서 천천히 채워가도 충분해요.
              </p>
            </GuideBox>
            <GuideBox label="한 문장으로 다시">
              <p>
                로그라인은 항상 <H>한 문장</H>으로 압축해 보세요. 누구나 5초 안에 읽을 수
                있어야 작품의 방향이 흔들리지 않아요.
              </p>
            </GuideBox>
            <GuideBox label="흔들릴 때 돌아오기">
              <p>회차가 길을 잃으면 이 3가지를 다시 떠올려 보세요.</p>
              <ul className="list-disc space-y-1 pl-4 mt-1.5">
                <li>주인공은 무엇을 원하나요?</li>
                <li>무엇이 그걸 막고 있나요?</li>
                <li>왜 지금 이야기가 시작되나요?</li>
              </ul>
            </GuideBox>
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
            <GuideBox label="검색 팁">
              <p>
                키워드는 짧게, 한 단어로. 너무 구체적이면 안 걸리고, 너무 일반적이면
                결과가 많아 찾기 힘들어집니다.
              </p>
            </GuideBox>
          </>
        ),
      },
      {
        title: '좋은 아이디어 아카이브의 작은 습관',
        body: (
          <>
            <GuideBox label="다듬지 말고 던지기">
              <p>
                떠오른 순간 <H>완성도 신경 X</H>. 한 단어·반쪽짜리 문장도 괜찮아요.
                다듬는 일은 회차 쓸 때로 미루세요.
              </p>
            </GuideBox>
            <GuideBox label="버려도 좋아요">
              <p>
                모든 아이디어를 회차에 쓸 필요는 없어요. 정기적으로 훑어보고
                <H>안 쓸 것</H>은 가볍게 삭제하면 보관함이 신선하게 유지됩니다.
              </p>
            </GuideBox>
            <GuideBox label="회차로 옮기기">
              <p>
                채택한 아이디어는 회차·세계관·인물 노트로 <H>옮겨 적으세요</H>. 보관함은
                초기 발화의 메모장, 본 작업은 각 탭에서 이어 갑니다.
              </p>
            </GuideBox>
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

// ── 우측 사이드바 4개 탭별 도움말 ────────────────────────────
const RIGHT_HELP: Partial<Record<RightPanelTab, TabHelp>> = {
  docs: {
    title: '문서 뷰어',
    steps: [
      {
        title: '여러 문서 동시에 띄우기',
        body: (
          <>
            <p>
              문서 뷰어는 메인 작업과 함께 참고할 문서를 <H>핀</H>으로 띄워두는 공간이에요.
              인물·세계관·플롯 카드를 옆에 두고 바로 비교할 수 있어요.
            </p>
            <GuideBox label="추가하는 법">
              <ul className="list-disc space-y-1 pl-4">
                <li>좌측 사이드바 항목을 <H>드래그</H>해서 이쪽으로 끌어다 놓기</li>
                <li>항목 우클릭 → <H>스테이지에 추가</H></li>
              </ul>
            </GuideBox>
          </>
        ),
      },
      {
        title: '순서 바꾸기 / 접기',
        body: (
          <>
            <p>
              패널 헤더의 <H>그립</H>으로 위아래 순서를 바꾸고, 헤더를 클릭하면 본문을
              <H> 접고 펼칠</H> 수 있어요. 더 이상 필요 없으면 X 로 닫습니다.
            </p>
            <GuideBox label="팁">
              <p>참고 문서가 너무 많아 답답하면 잠시 접어두세요. 핀은 유지됩니다.</p>
            </GuideBox>
          </>
        ),
      },
    ],
  },

  idea: {
    title: '아이디어',
    steps: [
      {
        title: '떠오를 때 바로 적기',
        body: (
          <>
            <p>
              아이디어 탭은 <H>휘발되는 생각을 잡아두는 공간</H>이에요. 입력란에 한 줄 적고
              <K>Enter</K> 만 누르면 카드로 저장됩니다.
            </p>
            <GuideBox label="태그로 분류">
              <p>
                상단의 <H>태그 칩</H>을 누르면 같은 태그의 아이디어만 모아 볼 수 있어요.
                태그를 누른 상태에서 작성하면 새 카드도 같은 태그로 저장됩니다.
              </p>
            </GuideBox>
          </>
        ),
      },
      {
        title: '정리·삭제',
        body: (
          <>
            <p>
              카드에 마우스를 올리면 우상단에 <H>휴지통</H>이 나타나요. <H>우클릭</H>으로
              위/아래로 이동하거나 삭제할 수 있어요.
            </p>
            <GuideBox label="정렬">
              <p>
                상단의 정렬 아이콘으로 가나다·생성순·최근 변경순으로 보기를 바꿀 수 있어요.
                기본 정렬에서는 우클릭 → <H>위로/아래로 이동</H>으로 순서를 직접 조정합니다.
              </p>
            </GuideBox>
          </>
        ),
      },
    ],
  },

  ai: {
    title: 'AI 도구',
    steps: [
      {
        title: '메뉴 — 4가지 도구 한눈에',
        body: (
          <>
            <p>
              AI 탭은 <H>도구 메뉴</H>의 4개 카드로 시작합니다. 목적에 맞는 카드를 누르면
              해당 도구 화면으로 들어가요.
            </p>
            <GuideBox label="4가지 도구">
              <ul className="list-disc space-y-1.5 pl-4">
                <li><H>문서 생성</H> — 자유 프롬프트로 회차 초안·인물·세계관·플롯 등 새 문서를 작성</li>
                <li><H>원고 검수</H> — 단일 회차의 인물·복선·시간선·설정 충돌·맞춤법을 종합 점검</li>
                <li><H>맞춤법 검사</H> — 회차 전체 또는 본문에서 드래그 선택한 영역만 빠르게 검사</li>
                <li><H>회차 요약 생성</H> — 한 줄 요약·등장인물·핵심 사건 등 12개 항목 자동 추출</li>
              </ul>
            </GuideBox>
            <GuideBox label="공통 흐름">
              <p>
                AI 결과는 본문에 자동 반영되지 않고 <H>작업물 탭</H>의 카드로 쌓입니다.
                <H> [적용]/[거절]</H> 으로 직접 결정하세요.
              </p>
            </GuideBox>
          </>
        ),
      },
      {
        title: '문서 생성 — 자유 프롬프트',
        body: (
          <>
            <p>
              만들고 싶은 문서를 자연어로 적으면 AI 가 종류를 자동 분류해 회차 본문·인물
              카드·세계관 노트·플롯 트리 중 적절한 형태로 생성합니다.
            </p>
            <GuideBox label="잘 적는 법">
              <ul className="list-disc space-y-1 pl-4">
                <li><H>대상</H> 명시 — "다음 화", "새 인물", "세계관 노트"</li>
                <li><H>맥락</H> 포함 — 등장인물, 시간/장소, 분위기, 분량</li>
                <li><H>참고 자료</H> 칸에 회차 범위·문서명을 적으면 AI 가 자동으로 찾아 참고</li>
              </ul>
            </GuideBox>
            <GuideBox label="결과 확인">
              <p>
                생성 시작 후 스트리밍으로 작성됩니다. 완료되면 작업물 탭에서 카드로 확인 →
                <H> 적용</H> 시 해당 위치에 새 문서가 만들어집니다.
              </p>
            </GuideBox>
          </>
        ),
      },
      {
        title: '원고 검수 — 종합 점검',
        body: (
          <>
            <p>
              좌측 사이드바에서 회차를 선택하면 자동으로 <H>검수 대상</H>으로 등록돼요.
              필요하면 상단 박스에서 다른 회차로 교체할 수 있습니다.
            </p>
            <GuideBox label="중점 사항(선택)">
              <p>
                특정 부분에만 집중시키고 싶다면 자유롭게 적어주세요. 비워두면
                <H> 일반 검수</H> (인물·복선·시간선·설정 충돌·맞춤법 모두) 가 진행됩니다.
              </p>
            </GuideBox>
            <GuideBox label="결과 보기">
              <ul className="list-disc space-y-1 pl-4">
                <li><H>점수</H> — 100점 만점, 80↑ 양호 · 50↑ 보통 · 미만 주의</li>
                <li><H>이슈 목록</H> — 위치/근거/제안. 본문에 형광펜으로 자동 표시</li>
                <li>각 이슈는 <H> [적용]/[거절]</H> 로 개별 처리</li>
                <li>이전 검수는 <H>검수 기록</H> 에서 다시 열어볼 수 있어요 (최근 10건)</li>
              </ul>
            </GuideBox>
          </>
        ),
      },
      {
        title: '맞춤법 검사 — 빠른 검토',
        body: (
          <>
            <p>
              회차 전체 또는 일부분만 빠르게 맞춤법·띄어쓰기를 검사합니다. 의미 검수가 아닌
              <H> 표기 위주</H> 의 가벼운 점검이에요.
            </p>
            <GuideBox label="두 가지 모드">
              <ul className="list-disc space-y-1 pl-4">
                <li><H>회차 전체</H> — 등록된 회차의 본문 전부 검사</li>
                <li><H>선택 영역만</H> — 본문에서 텍스트를 드래그 선택한 뒤 누르면 그 부분만 검사 (긴 회차에서 부분만 보고 싶을 때)</li>
              </ul>
            </GuideBox>
            <GuideBox label="결과 처리">
              <p>
                발견된 표기 이슈가 카드로 표시되고, 각 항목을 개별
                <H> 적용/거절</H> 할 수 있어요. 일괄 적용도 지원합니다.
              </p>
            </GuideBox>
          </>
        ),
      },
      {
        title: '회차 요약 생성 — 12 항목 추출',
        body: (
          <>
            <p>
              회차 본문에서 한 줄 요약·등장인물·핵심 사건·복선·정서 등
              <H> 12개 항목</H>을 자동 추출합니다. 다음 화 작성이나 다른 AI 도구의 컨텍스트로
              유용하게 쓸 수 있어요.
            </p>
            <GuideBox label="캐시로 무료 재호출">
              <p>
                이미 요약된 회차의 본문이 변경되지 않았다면 <H>크레딧 0회</H> 로 캐시에서 즉시
                반환됩니다. 동일 회차를 여러 번 열어봐도 안전해요.
              </p>
            </GuideBox>
          </>
        ),
      },
      {
        title: '채팅 모드 — 복합 작업',
        body: (
          <>
            <p>
              헤더 우측 <H>채팅</H> 스위치를 켜면 자유 대화로 Folio 에게 여러 작업을 한 번에
              요청할 수 있어요. (예: "5화 초안 작성하고, 새 인물 카드도 같이 만들어줘")
            </p>
            <GuideBox label="크레딧 사용">
              <p>
                모든 AI 응답은 크레딧을 소모합니다. 잔량과 사용량은
                <H> 설정 → 결제</H> 에서 확인할 수 있어요.
              </p>
            </GuideBox>
          </>
        ),
      },
    ],
  },

  inbox: {
    title: '작업물',
    steps: [
      {
        title: 'AI 결과는 여기로',
        body: (
          <>
            <p>
              AI 가 만든 초안·검수 의견·맞춤법 수정·요약 등은 모두 <H>작업물 탭</H>의 카드로
              들어와요. 본문은 자동 변경되지 않습니다.
            </p>
            <GuideBox label="기본 동작">
              <ul className="list-disc space-y-1 pl-4">
                <li><H>적용</H> — 본문에 반영</li>
                <li><H>거절</H> — 카드 닫기</li>
              </ul>
            </GuideBox>
          </>
        ),
      },
      {
        title: '비워두지 말기',
        body: (
          <>
            <p>
              쌓인 작업물 카드가 많아지면 정작 필요한 것을 놓치기 쉬워요. 적용·거절을 그때그때
              결정해서 <H>큐를 비워두는 습관</H>이 좋아요.
            </p>
          </>
        ),
      },
    ],
  },
};

export const RIGHT_TAB_HELP: Partial<Record<RightPanelTab, TabHelp>> = RIGHT_HELP;

/** 해당 우측 탭의 도움말이 정의돼 있는지 */
export function hasRightTabHelp(tab: RightPanelTab): boolean {
  return RIGHT_TAB_HELP[tab] !== undefined;
}

/**
 * 모든 탭 도움말(좌측 활동 + 우측 사이드바)의 "1회 자동 노출" 플래그(localStorage)를 삭제.
 * 튜토리얼 가이드 다시 시작 시 호출 — 다음 진입한 탭부터 도움말이 다시 자동으로 1회 뜨도록 함.
 */
export function resetTabHelpShownFlags(): void {
  for (const activity of Object.keys(TAB_HELP) as Activity[]) {
    localStorage.removeItem(`folio.tabHelp.${activity}.shown`);
  }
  for (const tab of Object.keys(RIGHT_TAB_HELP) as RightPanelTab[]) {
    localStorage.removeItem(`folio.rightTabHelp.${tab}.shown`);
  }
}
