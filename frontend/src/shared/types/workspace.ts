/**
 * 워크스페이스 사이드바/라우팅에서 공유되는 타입.
 */

export type WorkspaceSection =
  | 'plan'
  | 'world-note'
  | 'character'
  | 'plot'
  | 'episode'
  | 'foreshadow'
  | 'idea-archive';

/**
 * 액티비티 바(좁은 좌측 아이콘 바) 항목.
 * - `home`: 작품 목록
 * - 그 외: WorkspaceSection 과 동일
 */
export type Activity = 'home' | 'trash' | 'ai' | WorkspaceSection;

/** 상단 메인 아이콘 순서 */
export const ACTIVITY_ORDER_MAIN: Activity[] = [
  'home',
  'plan',
  'world-note',
  'character',
  'plot',
  'episode',
  'foreshadow',
  'idea-archive',
];

/** 하단 유틸 아이콘 순서 */
export const ACTIVITY_ORDER_BOTTOM: Activity[] = [
  'ai',
  'trash',
];

/** 전체 순서 (호환용) */
export const ACTIVITY_ORDER: Activity[] = [
  ...ACTIVITY_ORDER_MAIN,
  ...ACTIVITY_ORDER_BOTTOM,
];

export const SECTION_LABELS: Record<WorkspaceSection, string> = {
  'plan': '기획',
  'world-note': '세계관',
  'character': '등장인물',
  'plot': '플롯',
  'episode': '원고',
  'foreshadow': '복선',
  'idea-archive': '아이디어',
};

export const ACTIVITY_LABELS: Record<Activity, string> = {
  home: '홈',
  plan: '기획',
  'world-note': '세계관',
  character: '등장인물',
  plot: '플롯',
  episode: '원고',
  foreshadow: '복선',
  'idea-archive': '아이디어',
  ai: 'AI 도구',
  trash: '휴지통',
};

export const SECTION_ICONS: Record<WorkspaceSection, string> = {
  'plan': '📋',
  'world-note': '📚',
  'character': '👥',
  'plot': '📖',
  'episode': '📝',
  'foreshadow': '🎯',
  'idea-archive': '💡',
};

export const SECTION_TABLES: Record<WorkspaceSection, string> = {
  'plan': 'plan',
  'world-note': 'world_note',
  'character': 'character',
  'plot': 'plot',
  'episode': 'episode',
  'foreshadow': 'foreshadow',
  'idea-archive': 'idea_archive',
};

// ── 우측 보조 패널 ─────────────────────────────────────

/** 우측 패널에 표시 가능한 문서 유형 */
export type AuxDocType = 'episode' | 'world_note' | 'plan_note' | 'character_note' | 'plot' | 'character';

/** 우측 패널에 핀된 문서 */
export interface AuxPanelItem {
  id: string;            // 패널 인스턴스 고유 ID
  docType: AuxDocType;   // 문서 유형
  docId: string;         // DB 문서 ID
  title: string;         // 표시용 제목
  collapsed: boolean;    // 접힘 상태
}

/** Native DnD 전송에 사용하는 MIME 타입 */
export const AUX_DRAG_MIME = 'application/folio-doc';

export const AUX_DOC_LABELS: Record<AuxDocType, string> = {
  episode: '원고',
  world_note: '세계관',
  plan_note: '기획 문서',
  character_note: '캐릭터 문서',
  plot: '플롯',
  character: '캐릭터',
};
