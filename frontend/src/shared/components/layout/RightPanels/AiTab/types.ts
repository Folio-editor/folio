import type { WorkspaceSection } from '../../../../types/workspace';

export interface AiTabContentProps {
  selectedWorkId: string | null;
  mainSection: WorkspaceSection | null;
  mainItemId: string | null;
}

export interface EpisodeInfo {
  id: string;
  title: string;
  content: string | null;
  work_id: string;
  sort_order: number;
}

/** 절대 시각 ts(ms) → '방금 전' / 'N분 전' / 'N시간 전' / 'M/D HH:MM' 상대 라벨. */
export function formatHistoryTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return '방금 전';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
