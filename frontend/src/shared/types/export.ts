// ============================================================
// 문서 내보내기 (Export) 공유 타입
// ============================================================
// 렌더러(UI) → 어댑터(Electron Main / Web 브라우저) 간 IPC payload.
// 데이터 조회는 렌더러가 wa-sqlite로 수행하고, 어댑터는 변환만 담당한다.
// ============================================================

export type ExportFormat = 'txt' | 'docx' | 'pdf';

export type ExportScope =
  | { kind: 'work'; workId: string }
  | { kind: 'episodes'; workId: string; episodeIds: string[] }
  | { kind: 'episode'; workId: string; episodeId: string }
  | { kind: 'planSet'; workId: string };

export interface ExportOptions {
  includeCoverPage: boolean;
  includeToc: boolean;
  includeAuthorNote: boolean;
  pageSize: 'A4' | 'Letter';
  fontFamily: 'sans' | 'serif';
  /** UI에서 사용자에게 보여주는 기본 파일명(확장자 제외, sanitize 됨) */
  defaultFileName: string;
}

// ────────────────────────────────────────────────────────────
// Snapshot 타입 — wa-sqlite SELECT 결과를 IPC로 전달하기 위한 구조
// SQLite schema.ts 컬럼만 포함한다(entities.ts와 차이가 있어도 schema가 진실)
// ────────────────────────────────────────────────────────────

export interface WorkSnapshot {
  id: string;
  title: string;
  author_name: string | null;
  description: string | null;
  status: string;
}

export interface EpisodeSnapshot {
  id: string;
  parent_id: string | null;
  title: string;
  status: string;
  content: string | null;     // TipTap JSON 문자열
  word_count: number;
  sort_order: number;
}

export interface PlanSnapshot {
  slogan: string | null;
  /** SQLite에는 TEXT(JSON) — 미리 파싱한 배열 */
  genres: string[] | null;
  moods: string[] | null;
  target_audience: string | null;
}

export interface PlanNoteSnapshot {
  id: string;
  title: string;
  content: string | null;
  sort_order: number;
}

export interface CharacterSnapshot {
  id: string;
  name: string;
  profile_image_url: string | null;
  gender: string;
  age: string;
  sort_order: number;
}

export interface CharacterNoteSnapshot {
  id: string;
  character_id: string;
  kind: string;
  title: string;
  content: string | null;
  sort_order: number;
}

export interface CharacterCustomFieldSnapshot {
  character_id: string;
  field_name: string;
  field_value: string | null;
  sort_order: number;
}

export interface PlotSnapshot {
  id: string;
  parent_id: string | null;
  title: string;
  status: string | null;
  content: string | null;
  sort_order: number;
}

export interface PlotEpisodeLinkSnapshot {
  plot_id: string;
  episode_id: string;
}

export interface WorldNoteSnapshot {
  id: string;
  parent_id: string | null;
  name: string;
  content: string | null;
  sort_order: number;
}

export interface ForeshadowSnapshot {
  id: string;
  title: string;
  status: string;
  importance: string;
  content: string | null;
  sort_order: number;
}

export interface ForeshadowLinkSnapshot {
  foreshadow_id: string;
  link_type: string;
  episode_id: string | null;
  plot_id: string | null;
  context_memo: string | null;
}

export interface IdeaArchiveSnapshot {
  id: string;
  content: string;
  tag: string | null;
  sort_order: number;
}

export interface ExportPayload {
  work: WorkSnapshot;
  /** 표지 작가명 — work.author_name 우선, 폴백으로 authStore의 nickname을 채워 보낸다 */
  author: { name: string };
  episodes?: EpisodeSnapshot[];
  plan?: PlanSnapshot | null;
  planNotes?: PlanNoteSnapshot[];
  characters?: CharacterSnapshot[];
  characterNotes?: CharacterNoteSnapshot[];
  characterCustomFields?: CharacterCustomFieldSnapshot[];
  plots?: PlotSnapshot[];
  plotEpisodeLinks?: PlotEpisodeLinkSnapshot[];
  worldNotes?: WorldNoteSnapshot[];
  foreshadows?: ForeshadowSnapshot[];
  foreshadowLinks?: ForeshadowLinkSnapshot[];
  ideaArchives?: IdeaArchiveSnapshot[];
}

export interface ExportRequest {
  scope: ExportScope;
  format: ExportFormat;
  options: ExportOptions;
  payload: ExportPayload;
}

export interface ExportResult {
  ok: boolean;
  /** 저장된 파일 절대 경로(Electron) — Web에서는 보통 undefined */
  path?: string;
  /** 사용자에게 보일 한국어 에러 메시지 */
  error?: string;
  /** 사용자가 저장 다이얼로그/print 다이얼로그에서 취소 */
  cancelled?: boolean;
}

export type ExportProgressStage =
  | 'preparing'
  | 'rendering'
  | 'writing'
  | 'done';

export interface ExportProgress {
  stage: ExportProgressStage;
}

/**
 * 플랫폼 어댑터 공통 인터페이스.
 * Electron: IPC로 Main에 위임. Web: 렌더러 직접 변환 + Blob 다운로드/print.
 */
export interface FolioExportApi {
  run: (req: ExportRequest) => Promise<ExportResult>;
  /** 진행률 구독. 반환 함수 호출로 해지. Web 어댑터는 동기 변환이라 발화하지 않을 수도 있음. */
  onProgress: (callback: (p: ExportProgress) => void) => () => void;
  /**
   * Electron: shell.openPath(파일이 있는 폴더). Web: no-op.
   */
  openInFolder: (path: string) => Promise<void>;
}
