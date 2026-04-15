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

export const SECTION_LABELS: Record<WorkspaceSection, string> = {
  'plan': '기획',
  'world-note': '세계관',
  'character': '등장인물',
  'plot': '플롯',
  'episode': '원고',
  'foreshadow': '복선',
  'idea-archive': '아이디어',
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
