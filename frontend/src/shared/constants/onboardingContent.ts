// ============================================================
// 신규 사용자 가이드 워크스페이스용 더미 콘텐츠 상수
//
// 원작: 루시 모드 몽고메리 『빨간 머리 앤』 (1908) — 작가 1942년 사망, 저작권 만료(공유 영역).
// Folio 더미 콘텐츠는 원작 캐릭터·세계관을 차용하되 본문은 새로 작성한 요약·각색본.
// (번역본 별도 저작권 회피 — 원문 직접 인용 금지)
//
// 트리거: AuthenticatedApp 마운트 시 localStorage 'folio.onboarding.guideOffered' 미존재 +
//        가이드 작품(ONBOARDING_WORK.title) 미존재 → OnboardingGuideDialog 노출
// 생성 흐름: useOnboardingSeed.seed() 가 createWork → updateWork → createPlanNote →
//           ensureWorldNoteTemplates → createCharacter × N → ensureCharacterNotes →
//           updateCharacterNoteContent(intro) → createForeshadow + updateForeshadow →
//           createEpisode × N → createIdea × N
//
// 본문은 모두 TipTap JSON 직렬화 string. 형광펜·주석·장면전환 마크업을 군데군데 넣어
// 사용자가 더미 작품을 열자마자 에디터 기능을 발견할 수 있게 한다.
// ============================================================

/** 가이드 작품 description 식별자 — 설정에서 "다시 시작" 시 안전한 매칭에 사용 */
export const ONBOARDING_MARKER = '[folio_onboarding_v1]';

export const ONBOARDING_WORK = {
  title: '[샘플] 초록지붕 집의 앤',
  authorName: '예시 작가 (원작: L. M. 몽고메리)',
  description: `Folio 첫 사용자를 위한 가이드 작품입니다. 1908년 루시 모드 몽고메리의 『빨간 머리 앤』(저작권 만료 공유 영역)을 차용해 만들었습니다. ${ONBOARDING_MARKER} 자유롭게 수정·삭제하셔도 됩니다.`,
} as const;

// ── TipTap JSON 빌더 헬퍼 ─────────────────────────────────────
type Mark = { type: string; attrs?: Record<string, unknown> };
type TextNode = { type: 'text'; text: string; marks?: Mark[] };
type Node =
  | { type: 'paragraph'; content?: (TextNode | Node)[] }
  | { type: 'heading'; attrs: { level: number }; content?: (TextNode | Node)[] }
  | { type: 'sceneBreak' }
  | { type: 'horizontalRule' }
  | { type: 'bulletList'; content?: Node[] }
  | { type: 'listItem'; content?: Node[] };

function p(...children: (TextNode | Node)[]): Node {
  return { type: 'paragraph', content: children.length ? children : undefined };
}
function t(text: string): TextNode {
  return { type: 'text', text };
}
function bold(text: string): TextNode {
  return { type: 'text', text, marks: [{ type: 'bold' }] };
}
function italic(text: string): TextNode {
  return { type: 'text', text, marks: [{ type: 'italic' }] };
}
function highlight(text: string, color = 'yellow'): TextNode {
  return { type: 'text', text, marks: [{ type: 'highlight', attrs: { color } }] };
}
/** 주석(authorNote) — AI 파서가 자동 제외하는 작가 전용 메모 */
function note(text: string): TextNode {
  return { type: 'text', text, marks: [{ type: 'authorNote' }] };
}
function h(level: 1 | 2 | 3, text: string): Node {
  return { type: 'heading', attrs: { level }, content: [t(text)] };
}
function sceneBreak(): Node {
  return { type: 'sceneBreak' };
}
function bullet(...items: string[]): Node {
  return {
    type: 'bulletList',
    content: items.map((item) => ({
      type: 'listItem',
      content: [p(t(item))],
    })),
  };
}

function doc(...nodes: Node[]): string {
  return JSON.stringify({ type: 'doc', content: nodes });
}

// ── 기획 메타 (작품 홈에 노출되는 장르 / 분위기 태그) ─────────
// plan.genres / plan.moods 컬럼은 JSON.stringify 된 string[] 형식으로 저장된다
// (WorkspaceHomeScreen.parseTags 가 JSON.parse 후 string[] 만 사용).
// useOnboardingSeed 가 ensurePlan 직후 updatePlan 으로 채운다.
export const ONBOARDING_PLAN_META = {
  genres: ['성장소설', '가족 드라마'],
  moods: ['따뜻함', '잔잔함', '유머'],
} as const;

// ── 기획 노트 ─────────────────────────────────────────────────
export const ONBOARDING_PLAN_NOTE = {
  title: '기획서',
  content: doc(
    h(2, '시놉시스'),
    p(
      t('캐나다 프린스 에드워드 섬의 작은 마을 '),
      bold('애번리'),
      t('. 농사를 짓는 남매 매튜와 마릴라 커스버트는 일손을 도울 '),
      highlight('남자 고아', 'yellow'),
      t('를 입양하기로 한다. 그러나 역에서 마차를 기다리는 매튜를 마중한 것은 '),
      highlight('빨간 머리에 주근깨투성이의 11세 소녀', 'pink'),
      t(' 앤 셜리였다.'),
    ),
    p(
      t('처음엔 돌려보내려 했지만, 앤의 무한한 상상력과 끝없는 수다에 매튜는 마음을 빼앗기고 만다. 이 작품은 앤이 초록지붕 집에 자리 잡으며 마을 사람들과 부딪치고, 친구를 사귀고, 학교에서 라이벌을 만나며 진짜 가족을 찾아가는 '),
      bold('성장 이야기'),
      t('다.'),
    ),
    h(2, '장르 / 톤'),
    bullet('성장소설 (Coming-of-age)', '가족 드라마', '잔잔한 시골 풍경과 따뜻한 유머'),
    h(2, '메인 갈등'),
    p(
      t('앤은 '),
      bold('남자아이를 원했던 커스버트 남매'),
      t('의 기대와 어긋난 채 도착했다. 자신을 받아줄지 끝까지 알 수 없는 불안 vs 어떻게든 사랑받고 싶은 간절함 — 이 내적 갈등이 앤의 모든 행동을 추진한다.'),
    ),
    h(2, '타겟 독자'),
    p(t('전 연령. 특히 따뜻한 감성과 인물 중심 서사를 좋아하는 10~30대 독자.')),
    p(note('💡 [작가 메모] 앤의 상상력은 풍경 묘사로 표현하면 자연스럽다. 길은 "기쁨의 하얀 길", 호수는 "빛나는 호수"처럼 앤이 직접 이름 붙이는 장면을 회차마다 한두 개씩 배치할 것.')),
  ),
} as const;

// ── 캐릭터 ───────────────────────────────────────────────────
export const ONBOARDING_CHARACTERS = [
  {
    name: '앤 셜리',
    gender: '여',
    age: '11',
    introContent: doc(
      h(2, '한 줄 소개'),
      p(t('상상력이 무한한 11세 고아 소녀. 초록지붕 집에 입양되며 인생이 바뀐다.')),
      h(2, '외형'),
      bullet(
        '눈에 띄는 진한 빨간 머리 — 본인은 가장 싫어하는 부분',
        '주근깨가 코와 양 볼에 가득',
        '마른 체형, 큰 회색빛 눈',
      ),
      h(2, '성격'),
      bullet(
        '말이 매우 빠르고 많음 — 한 번 시작하면 멈추지 않는다',
        '낭만적인 풍경에 즉시 반응 — 길·호수·나무에 직접 이름 붙임',
        '자존심 강함 — 빨간 머리를 놀리는 사람을 절대 용서 안 함',
        '의외로 책임감이 강해 한 번 결심한 일은 끝까지',
      ),
      h(2, '동기'),
      p(
        t('11년간 떠돌이로 살아온 앤은 '),
        highlight('"평생 머무를 수 있는 집"', 'pink'),
        t('을 갈망한다. 초록지붕 집은 그녀가 처음 가져보는 집이며, 마릴라와 매튜는 처음 가져보는 가족이다.'),
      ),
      p(note('💡 [작가 메모] 앤의 대사는 항상 "~겠죠? ~잖아요" 같은 의문/감탄형으로 끝나도록. 어른의 확언과 대비되는 톤.')),
    ),
  },
  {
    name: '매튜 커스버트',
    gender: '남',
    age: '60',
    introContent: doc(
      h(2, '한 줄 소개'),
      p(t('과묵한 60세 농부. 앤을 처음 역에서 마중한 사람이자 가장 든든한 보호자.')),
      h(2, '외형'),
      bullet('잿빛이 도는 갈색 수염', '약간 굽은 등', '항상 같은 회색 셔츠와 갈색 모자'),
      h(2, '성격'),
      bullet(
        '극도로 수줍음 — 여성과 대화하는 것을 어려워함',
        '말수가 적지만 한 마디 한 마디가 무겁다',
        '앤에게만은 이상하게 마음이 풀어짐',
        '고집은 마릴라보다 셈',
      ),
      h(2, '비밀'),
      p(
        t('약한 심장을 가지고 있다. 본인도 알고 있지만 마릴라에게는 숨긴다. '),
        highlight('이는 후반부에 결정적으로 작동.', 'red'),
      ),
      p(note('💡 [작가 메모] 매튜는 직접 말로 표현하지 않고 행동으로 사랑을 보여주는 인물. 퍼프 소매 드레스 선물 장면이 클라이맥스 중 하나.')),
    ),
  },
  {
    name: '마릴라 커스버트',
    gender: '여',
    age: '55',
    introContent: doc(
      h(2, '한 줄 소개'),
      p(t('매튜의 누나. 엄격하고 실용적이지만 속은 누구보다 따뜻한 55세 여성.')),
      h(2, '성격'),
      bullet(
        '엄격한 청교도적 가치관',
        '감정 표현을 부끄러워함',
        '책임감이 강하고 약속을 어기지 않음',
        '겉으로는 단호하지만 속으로는 갈등이 많음',
      ),
      h(2, '아치 (변화)'),
      p(
        t('처음엔 앤을 "실수로 온 아이"로 여기며 돌려보내려 했지만, '),
        italic('"이 아이는 우리에게 온 게 아니라 우리가 이 아이에게 온 거야"'),
        t(' — 작품 후반부 마릴라의 깨달음이 핵심.'),
      ),
    ),
  },
] as const;

// ── 복선 ─────────────────────────────────────────────────────
export const ONBOARDING_FORESHADOW = [
  {
    title: '매튜의 약한 심장',
    importance: '상',
    status: '심기',
    content: doc(
      h(3, '심기'),
      p(t('1부 초반, 매튜가 가벼운 농사일에도 가슴을 두드리며 잠시 쉬는 묘사가 두어 번 등장한다. 마릴라는 "또 무리하지 말라"고 잔소리하지만 앤은 알아채지 못한다.')),
      h(3, '의도'),
      p(
        t('매튜의 죽음은 '),
        bold('앤의 진짜 성장'),
        t('을 강제한다. 더 이상 떠돌이가 아닌 "가족을 책임지는 사람"이 되는 결정적 계기.'),
      ),
      h(3, '회수 예정'),
      p(t('마지막 장 직전, 은행 도산 소식을 들은 매튜가 쓰러진다. 앤은 그제야 매튜가 자신에게 어떤 존재였는지 깨닫고, 대학 진학 대신 애번리에 남기로 결심한다.')),
      p(note('💡 심기 장면은 너무 강하게 보이지 않게 — 독자가 눈치채지 못한 채 후반부에 "아, 그래서 그랬구나" 라고 느껴야 한다.')),
    ),
  },
  {
    title: '길버트와의 첫 만남',
    importance: '중',
    status: '심기',
    content: doc(
      h(3, '심기'),
      p(
        t('학교에서 길버트 블라이드가 앤의 빨간 머리를 보고 '),
        italic('"홍당무!"'),
        t(' 라고 놀린다. 앤은 분노에 휩싸여 석판으로 길버트의 머리를 후려친다.'),
      ),
      h(3, '의도'),
      p(
        t('이 사건이 앤이 길버트를 '),
        highlight('수년간 무시', 'orange'),
        t('하는 원인이 된다. 그러나 결국 두 사람은 학업에서 라이벌이 되고, 어른이 되어 화해한다 (속편 시리즈로 이어지는 로맨스의 씨앗).'),
      ),
    ),
  },
] as const;

// ── 회차 ─────────────────────────────────────────────────────
export const ONBOARDING_EPISODES = [
  {
    title: '1화 — 초록지붕 집의 첫날',
    content: doc(
      p(
        t('브라이트 리버 역. 매튜 커스버트는 마차에서 내려 플랫폼을 둘러보았다. '),
        highlight('남자아이가 보이지 않았다.', 'yellow'),
      ),
      p(
        t('대신 깡마른 빨간 머리 소녀 하나가 낡은 가방을 양손에 꼭 쥐고 벤치 위에 앉아 있었다. 매튜의 발걸음 소리에 소녀는 고개를 들었다 — 그리고 '),
        highlight('말을 시작했다.', 'green'),
      ),
      p(italic('"커스버트 씨이신가요? 정말 다행이에요. 저는 앤이라고 해요. 끝에 \'e\'가 붙는 앤 — 그게 훨씬 우아하잖아요? 만나서 정말 정말 기뻐요."')),
      sceneBreak(),
      p(t('마차가 "기쁨의 하얀 길"을 지났다. — 사실 그건 앤이 방금 붙인 이름이었다.')),
      p(italic('"매튜 아저씨, 이 길에는 이름이 있나요? 없다면 제가 지어도 될까요? \'기쁨의 하얀 길\'이 어떨까요? 사과꽃이 양옆으로 활짝 피어 있잖아요."')),
      p(
        t('매튜는 대답 대신 고개를 살짝 끄덕였다. '),
        note('[작가 메모] 매튜는 거의 말을 하지 않지만, 이 끄덕임 하나로 앤에 대한 첫 호감을 표현. 독자가 행동으로 캐릭터를 읽게 만드는 장면.'),
      ),
      sceneBreak(),
      p(t('초록지붕 집의 부엌. 마릴라는 매튜의 마차에서 내린 빨간 머리 소녀를 보고 자리에서 일어났다.')),
      p(italic('"매튜, 이 아이는 누구야?"')),
      p(italic('"... 우리가 입양하기로 한 아이."')),
      p(italic('"우리가 부탁한 건 남자아이였잖아!"')),
      p(
        t('소녀의 얼굴이 일그러졌다. 입을 다물고 가방을 떨어뜨리더니 '),
        bold('울기 시작했다'),
        t('. 매튜와 마릴라는 어쩔 줄 몰라 서로를 쳐다보았다.'),
      ),
    ),
  },
  {
    title: '2화 — 길버트와 석판',
    content: doc(
      p(
        t('애번리 학교의 첫 등교일. 앤은 다이애나 배리와 짝이 되어 자리에 앉았다. — 다이애나는 앤이 처음 가진 '),
        bold('마음의 친구(bosom friend)'),
        t('였다.'),
      ),
      p(italic('"앤, 너 빨간 머리지만 진짜 예뻐. 진심이야."')),
      p(italic('"고마워, 다이애나. 너랑 평생 친구할 거야."')),
      sceneBreak(),
      p(t('점심시간 후. 옆자리 책상에서 키 큰 소년이 슬며시 앤의 땋은 머리 끝을 잡아당겼다. 길버트 블라이드였다.')),
      p(italic('"홍당무!"')),
      p(
        t('교실이 잠시 조용해졌다. 앤의 얼굴이 머리카락만큼 빨갛게 달아올랐다. 한순간이었다. 앤은 옆에 있던 '),
        highlight('석판을 들어 길버트의 머리 위로 내리쳤다.', 'red'),
      ),
      p(t('석판이 두 동강 났다. 교실은 폭소와 비명으로 동시에 가득 찼다.')),
      sceneBreak(),
      p(italic('"앤 셜리 — 평생 너랑 말 안 해."')),
      p(t('앤은 그날부터 길버트를 무시하기로 결심했다. 길버트가 사과해도, 학용품을 빌려주려 해도, 절대 받지 않았다.')),
      p(note('💡 길버트는 사실 앤에게 호감이 있어서 장난친 거였다는 점을 독자가 살짝 눈치챌 수 있게. 너무 노골적이면 안 됨.')),
    ),
  },
  {
    title: '3화 — 자수정 브로치',
    content: doc(
      p(t('마릴라가 가장 아끼는 자수정 브로치가 사라졌다. 마릴라는 앤이 만진 적이 있다는 사실을 떠올렸다.')),
      p(italic('"앤, 사실대로 말해라. 브로치를 어떻게 한 거니?"')),
      p(italic('"... 만지긴 했어요. 하지만 다시 제자리에 두었어요. 정말이에요, 마릴라 아주머니!"')),
      p(t('마릴라는 믿지 않았다. 앤이 거짓말을 한다고 생각한 마릴라는 — 처음으로 — 앤에게 외출 금지령을 내렸다.')),
      sceneBreak(),
      p(
        t('그날 밤, 앤은 마음의 친구 다이애나의 생일 파티에 갈 수 없게 됐다는 절망에 빠졌다. 그리고 마침내 '),
        highlight('마릴라가 "믿어주기를 원하는" 거짓말을 지어내기로 결심했다.', 'purple'),
      ),
      p(italic('"제가 가져갔어요. 호수에 빠뜨렸어요. 정말 죄송해요. 부디 다이애나의 파티에 가게 해주세요."')),
      p(t('마릴라는 화를 내며 앤을 방에 가두었다. 그러고는 — 이튿날 — 자신의 검정 숄에서 자수정 브로치를 발견했다. 어제 짐을 옮기다 떨어진 채 잊고 있었던 것이다.')),
      sceneBreak(),
      p(italic('"앤, 미안하다. 정말 미안하다."')),
      p(italic('"마릴라 아주머니, 저는 거짓말을 했어요. 그건 제가 잘못한 거예요. 절 용서하실 수 있어요?"')),
      p(
        t('마릴라는 잠시 입을 다물었다. 그리고 평소답지 않게 — 앤의 머리를 한 번 쓰다듬었다. '),
        note('[작가 메모] 마릴라가 처음으로 앤에게 신체 접촉으로 애정 표현하는 장면. 마릴라 아치의 첫 번째 변화점.'),
      ),
    ),
  },
] as const;

// ── 아이디어 아카이브 ─────────────────────────────────────────
export const ONBOARDING_IDEAS = [
  {
    tag: '캐릭터',
    content: doc(
      p(
        t('앤이 다이애나에게 '),
        bold('나무 딸기 주스'),
        t('인 줄 알고 포도주를 대접하는 에피소드 — 다이애나가 만취해 집에 돌아가고, 다이애나의 어머니가 격노해 두 사람의 우정을 금지한다. '),
        italic('"마음의 친구"'),
        t(' 관계의 첫 위기.'),
      ),
    ),
  },
  {
    tag: '장면',
    content: doc(
      p(
        t('비 오는 날 매튜가 시내까지 나가 '),
        highlight('퍼프 소매 드레스', 'pink'),
        t('를 사오는 장면. 평생 옷가게에 들어가 본 적 없는 매튜가 점원에게 "여자아이가 좋아할 만한 걸로" 부탁하는 어색함을 코믹하게 묘사.'),
      ),
    ),
  },
  {
    tag: '대사',
    content: doc(
      p(
        italic('"내일은 아직 아무 실수도 일어나지 않은 새 날이라고 생각하면 멋지지 않나요?"'),
        t(' — 앤이 마릴라에게 자주 하는 말. '),
        bold('이 작품의 주제'),
        t('를 한 줄로 압축한 대사로 사용 가능.'),
      ),
    ),
  },
] as const;
