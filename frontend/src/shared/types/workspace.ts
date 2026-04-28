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
export type Activity = 'home' | 'trash' | WorkspaceSection;

/** 상단 메인 아이콘 순서.
 *
 * `idea-archive` 는 좌측 ActivityBar 메인 영역에서 제외 — 우측 패널 idea 탭이
 * 1차 진입 동선이고, ActivityBar에서는 별도 "퀵 점프" 버튼(우측 패널 토글)으로 표현된다.
 * 메인 패널이 idea-archive 노트를 띄우는 흐름(mainDoc.section === 'idea-archive')은 그대로.
 */
export const ACTIVITY_ORDER_MAIN: Activity[] = [
  'home',
  'plan',
  'world-note',
  'character',
  'plot',
  'episode',
  'foreshadow',
];

/** 하단 유틸 아이콘 순서 */
export const ACTIVITY_ORDER_BOTTOM: Activity[] = [
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

// ── 사이드바 클릭 의도 ─────────────────────────────────

/**
 * 사이드바 항목 클릭 시 의도. AuthenticatedApp의 디스패처가 분기 처리.
 *
 * Stage Manager 단순화 모델:
 * - default (단일 클릭): 메인 스테이지에 올림. 현 메인은 즉시 교체됨.
 * - pin (더블 클릭 / ⌘·Ctrl+Click / 드래그): 우측 서브 스테이지에 적층.
 *
 * 메인 보존이 필요하면 사용자가 메인 헤더의 ↗ (우측으로 보내기)를 먼저 누르고
 * 다른 항목을 단일 클릭하면 됨 — 명시적 의도 표시.
 */
export type ClickIntent = 'default' | 'pin' | 'newTab';

/** 메인 패널이 표시 중인 문서 */
export interface MainDoc {
  section: WorkspaceSection;
  itemId: string;
}

/** 메인 다중 탭의 단일 탭 인스턴스. doc=null = 빈 탭(welcome) */
export interface MainTab {
  id: string;
  doc: MainDoc | null;
  /**
   * 이 탭이 속한 작품 컨텍스트.
   * 작품별로 탭 세트를 분리 보존하기 위해 사용 — 다른 작품의 탭은 tabs 배열에
   * 그대로 남되 화면에는 currentWorkId === workId 인 탭만 노출된다.
   * null = 작품 컨텍스트 미지정 (현재 사용처 없음, 안전 기본값).
   */
  workId: string | null;
}

// ── 우측 사이드바 탭 ───────────────────────────────────

/** 우측 사이드바 탭 */
export type RightPanelTab = 'docs' | 'idea' | 'ai';

// ── 우측 보조 패널 ─────────────────────────────────────

/** 우측 패널에 표시 가능한 문서 유형 */
export type AuxDocType = 'episode' | 'world_note' | 'plan_note' | 'character_note' | 'plot' | 'character' | 'foreshadow';

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
  foreshadow: '복선',
};

// ── 본문 ↔ 우측 패널 스위칭 유틸 ──────────────────────

/** 우측 패널 docType → 메인 에디터 라우팅 정보로 변환 */
export function docTypeToRoute(
  docType: AuxDocType,
  docId: string,
): { activity: Activity; section: WorkspaceSection; itemId: string | null } | null {
  switch (docType) {
    case 'episode':        return { activity: 'episode',    section: 'episode',      itemId: docId };
    case 'world_note':     return { activity: 'world-note', section: 'world-note',   itemId: docId };
    case 'plan_note':      return { activity: 'plan',       section: 'plan',         itemId: docId };
    case 'character_note': return { activity: 'character',  section: 'character',    itemId: 'cnote:' + docId };
    case 'character':      return { activity: 'character',  section: 'character',    itemId: 'char:' + docId };
    case 'foreshadow':     return { activity: 'foreshadow', section: 'foreshadow',   itemId: docId };
    case 'plot':           return { activity: 'plot',       section: 'plot',         itemId: docId };
  }
}

/** 현재 메인 에디터 상태 → AuxPanelItem 생성 정보로 역매핑 */
export function currentDocToAuxItem(
  section: WorkspaceSection,
  itemId: string,
  title: string,
): Omit<AuxPanelItem, 'id' | 'collapsed'> | null {
  switch (section) {
    case 'episode':      return { docType: 'episode',        docId: itemId, title };
    case 'world-note':   return { docType: 'world_note',     docId: itemId, title };
    case 'plan':         return { docType: 'plan_note',      docId: itemId, title };
    case 'foreshadow':   return { docType: 'foreshadow',     docId: itemId, title };
    case 'plot':
      // '__all__' (전체 통합 뷰)도 우측 패널 핀 가능 — list 형태로만 표시
      return { docType: 'plot', docId: itemId, title };
    case 'character': {
      if (itemId.startsWith('cnote:'))
        return { docType: 'character_note', docId: itemId.slice(6), title };
      if (itemId.startsWith('char:'))
        return { docType: 'character',      docId: itemId.slice(5), title };
      return null;
    }
    default: return null;
  }
}
