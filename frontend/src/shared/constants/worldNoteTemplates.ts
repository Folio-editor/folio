/**
 * 작품의 세계관 탭 최초 진입 시 자동 생성되는 기본 템플릿.
 * useLocalWrite.ensureWorldNoteTemplates 가 이 배열을 그대로 INSERT 하며,
 * UI(예: OnboardingGuideDialog 미니어처 카운트)도 이 배열의 길이를 참조한다.
 * 항목·순서를 바꾸면 두 곳 모두에 즉시 반영된다.
 */
export const WORLD_NOTE_TEMPLATES = [
  '시대/배경',
  '공간/지리',
  '세력/조직',
  '규칙/법칙',
  '역사/연표',
] as const;
