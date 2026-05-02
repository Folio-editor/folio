import { useMemo } from 'react';
import { useQuery } from '@powersync/react';
import { Link2, Plus } from 'lucide-react';
import { useWriterId } from '../../hooks/useWriterId';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useDecryptedPlotList, type RawPlotRow } from '../../hooks/useDecryptedPlot';
import {
  useDecryptedEpisodeList,
  type DecryptedEpisodeListRow,
  type RawEpisodeListRow,
} from '../../hooks/useDecryptedEpisode';
import { Button } from '../../components/ui/Button';
import { ViewToggle } from '../../components/ui/ViewToggle';
import { MainPanelHeader } from '../../components/layout/MainPanelHeader';
import { ExportButton } from '../workspace/ExportButton';
import { cn } from '../../lib/cn';
import { parseServerDate } from '../../lib/dateTime';
import { contentToHtml } from '../../lib/tiptapPreview';

interface EpisodeOverviewProps {
  workId: string;
  onSelect: (id: string) => void;
}

type EpisodeRow = DecryptedEpisodeListRow;

const STATUS_COLOR: Record<string, string> = {
  '미작성': 'bg-muted text-muted-foreground',
  '초고': 'bg-warning-soft text-warning',
  '퇴고': 'bg-info-soft text-info',
  '완성': 'bg-success-soft text-success',
};

export function EpisodeOverview({ workId, onSelect }: EpisodeOverviewProps) {
  const writerId = useWriterId();
  const { createEpisode } = useLocalWrite();
  const [viewMode, setViewMode] = usePersistentState<'grid' | 'list'>('folio.ui.view-mode.episode', 'list');

  const { data: rawEpisodes = [] } = useQuery<RawEpisodeListRow>(
    `SELECT e.id, e.work_id, e.title, e.status, e.word_count, e.content,
            e.sort_order, e.parent_id, e.created_at, e.updated_at,
            w.encrypted_dek
       FROM episode e
       LEFT JOIN work w ON w.id = e.work_id
      WHERE e.work_id = ? AND e.writer_id = ? AND e.status != 'trashed'
      ORDER BY e.sort_order ASC, e.created_at ASC`,
    [workId, writerId],
  );
  const { data: episodes } = useDecryptedEpisodeList(rawEpisodes);

  const { data: rawLinkRows = [] } = useQuery<{
    episode_id: string;
    plot_id: string;
    plot_title: string | null;
    plot_work_id: string;
    plot_writer_id: string;
    plot_parent_id: string | null;
    plot_status: string | null;
    plot_content: string | null;
    plot_sort_order: number | null;
    plot_created_at: string;
    plot_updated_at: string;
    encrypted_dek: string | null;
  }>(
    `SELECT pel.episode_id, pel.plot_id,
            p.title AS plot_title, p.work_id AS plot_work_id, p.writer_id AS plot_writer_id,
            p.parent_id AS plot_parent_id, p.status AS plot_status, p.content AS plot_content,
            p.sort_order AS plot_sort_order, p.created_at AS plot_created_at, p.updated_at AS plot_updated_at,
            w.encrypted_dek AS encrypted_dek
     FROM plot_episode_link pel
     JOIN plot p ON p.id = pel.plot_id
     LEFT JOIN work w ON w.id = p.work_id`,
  );
  const rawPlotRows: RawPlotRow[] = useMemo(
    () =>
      rawLinkRows.map((r) => ({
        id: r.plot_id,
        work_id: r.plot_work_id,
        writer_id: r.plot_writer_id,
        parent_id: r.plot_parent_id,
        title: r.plot_title,
        status: r.plot_status,
        content: r.plot_content,
        sort_order: r.plot_sort_order,
        created_at: r.plot_created_at,
        updated_at: r.plot_updated_at,
        encrypted_dek: r.encrypted_dek,
      })),
    [rawLinkRows],
  );
  const { data: decryptedPlots } = useDecryptedPlotList(rawPlotRows);

  const linkByEpisode = useMemo(() => {
    const titleByPlotId = new Map<string, string>();
    for (const p of decryptedPlots) titleByPlotId.set(p.id, p.title);
    const map = new Map<string, string>();
    for (const r of rawLinkRows) {
      const t = titleByPlotId.get(r.plot_id) ?? '';
      map.set(r.episode_id, t);
    }
    return map;
  }, [rawLinkRows, decryptedPlots]);

  const handleNew = async () => {
    const title = `${episodes.length + 1}화`;
    const id = await createEpisode(workId, title, episodes.length);
    onSelect(id);
  };

  const totalWords = episodes.reduce((sum, ep) => sum + ep.word_count, 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MainPanelHeader
        title={<h2 className="text-lg font-semibold">원고</h2>}
        subtitle="실제 본문을 집필합니다"
        trailing={
          <div className="flex items-center gap-2">
            {episodes.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {episodes.length}편 · {totalWords.toLocaleString()}자
              </span>
            )}
            <ViewToggle mode={viewMode} onChange={setViewMode} />
            <ExportButton workId={workId} />
            <Button size="sm" onClick={() => void handleNew()}>
              <Plus className="h-4 w-4" />새 원고
            </Button>
          </div>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {episodes.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            아직 원고가 없습니다. 새 원고를 추가하여 집필을 시작하세요.
          </p>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {episodes.map((ep) => (
              <EpisodeCard
                key={ep.id}
                episode={ep}
                plotTitle={linkByEpisode.get(ep.id)}
                onClick={() => onSelect(ep.id)}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {episodes.map((ep) => (
              <EpisodeListItem
                key={ep.id}
                episode={ep}
                plotTitle={linkByEpisode.get(ep.id)}
                onClick={() => onSelect(ep.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── 회차 카드 (그리드) ── */

function EpisodeCard({
  episode,
  plotTitle,
  onClick,
}: {
  episode: EpisodeRow;
  plotTitle?: string;
  onClick: () => void;
}) {
  const previewHtml = useMemo(() => contentToHtml(episode.content), [episode.content]);

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-ring hover:bg-primary/5"
    >
      <span className="text-sm font-medium text-foreground">
        {episode.title?.trim() || '(제목 없음)'}
      </span>

      {previewHtml ? (
        <div
          className="note-preview mt-2 line-clamp-3 text-xs text-muted-foreground"
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      ) : (
        <p className="mt-2 text-xs text-muted-foreground/50">내용 없음</p>
      )}

      <div className="mt-3 flex w-full items-center gap-1.5 text-[10px] text-muted-foreground">
        <span
          className={cn(
            'rounded-full px-2 py-0.5',
            STATUS_COLOR[episode.status] ?? 'bg-muted',
          )}
        >
          {episode.status}
        </span>
        <span>·</span>
        <span>{episode.word_count.toLocaleString()}자</span>
        <span>·</span>
        <span>{formatRelativeTime(episode.updated_at)}</span>
      </div>

      {plotTitle && (
        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-primary/70">
          <Link2 size={10} />
          <span className="truncate">{plotTitle}</span>
        </div>
      )}
    </button>
  );
}

/* ── 회차 리스트 항목 ── */

function EpisodeListItem({
  episode,
  plotTitle,
  onClick,
}: {
  episode: EpisodeRow;
  plotTitle?: string;
  onClick: () => void;
}) {
  const previewHtml = useMemo(() => contentToHtml(episode.content), [episode.content]);

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:border-ring hover:bg-primary/5"
    >
      <div className="flex w-full items-start justify-between gap-3">
        <span className="text-sm font-medium text-foreground">
          {episode.title?.trim() || '(제목 없음)'}
        </span>
        <div className="flex shrink-0 items-center gap-1.5 text-[10px] text-muted-foreground">
          <span
            className={cn(
              'rounded-full px-2 py-0.5',
              STATUS_COLOR[episode.status] ?? 'bg-muted',
            )}
          >
            {episode.status}
          </span>
          <span>·</span>
          <span>{episode.word_count.toLocaleString()}자</span>
        </div>
      </div>

      <div className="flex w-full items-end justify-between gap-3 mt-1">
        {previewHtml ? (
          <div
            className="note-preview line-clamp-1 min-w-0 flex-1 text-xs text-muted-foreground"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        ) : (
          <span className="text-xs text-muted-foreground/50">내용 없음</span>
        )}
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {formatRelativeTime(episode.updated_at)}
        </span>
      </div>

      {plotTitle && (
        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-primary/70">
          <Link2 size={10} />
          <span className="truncate">{plotTitle}</span>
        </div>
      )}
    </button>
  );
}

/* ── 유틸 ── */

function formatRelativeTime(iso: string): string {
  const d = parseServerDate(iso);
  if (!d) return '';
  const diff = Date.now() - d.getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return '방금 전';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}개월 전`;
  return `${Math.floor(months / 12)}년 전`;
}

