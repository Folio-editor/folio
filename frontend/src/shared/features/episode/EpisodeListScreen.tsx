import { useQuery } from '@powersync/react';
import { useWriterId } from '../../hooks/useWriterId';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import {
  useDecryptedEpisodeList,
  type RawEpisodeListRow,
} from '../../hooks/useDecryptedEpisode';
import { Button } from '../../components/ui/Button';
import { MainPanelHeader } from '../../components/layout/MainPanelHeader';

interface EpisodeListScreenProps {
  workId: string;
  onSelect: (id: string) => void;
}

const STATUS_COLOR: Record<string, string> = {
  '예정': 'bg-muted text-muted-foreground',
  '초고': 'bg-warning-soft text-warning',
  '퇴고': 'bg-info-soft text-info',
  '완성': 'bg-success-soft text-success',
};

export function EpisodeListScreen({ workId, onSelect }: EpisodeListScreenProps) {
  const writerId = useWriterId();
  const { createEpisode } = useLocalWrite();
  const { data: rawRows = [] } = useQuery<RawEpisodeListRow>(
    `SELECT e.id, e.work_id, e.title, e.status, e.word_count, e.sort_order,
            e.parent_id, e.created_at, e.updated_at, w.encrypted_dek
       FROM episode e
       LEFT JOIN work w ON w.id = e.work_id
      WHERE e.work_id = ? AND e.writer_id = ?
      ORDER BY e.sort_order ASC, e.created_at ASC`,
    [workId, writerId],
  );
  const { data: items } = useDecryptedEpisodeList(rawRows);

  const handleNew = async () => {
    // rawRows 는 unfiltered. MAX(sort_order)+1000 으로 항상 끝에 배치.
    const sortOrder =
      rawRows.length === 0
        ? 0
        : Math.max(...rawRows.map((r) => r.sort_order ?? 0)) + 1000;
    const id = await createEpisode(workId, `${items.length + 1}화`, sortOrder);
    onSelect(id);
  };

  return (
    <div className="flex h-full flex-col">
      <MainPanelHeader
        title={<h2 className="text-lg font-semibold">원고</h2>}
        subtitle="실제 본문을 집필합니다"
        trailing={<Button onClick={() => void handleNew()}>+ 새 회차</Button>}
      />
      <div className="flex-1 overflow-y-auto p-6">
        {items.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">아직 회차가 없습니다.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3 text-left transition-colors hover:border-primary/40 hover:shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="w-8 text-xs text-muted-foreground">#{idx + 1}</span>
                  <span className="text-sm font-medium text-foreground">{item.title}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {item.word_count.toLocaleString()}자
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLOR[item.status] ?? 'bg-muted text-muted-foreground'}`}
                  >
                    {item.status}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
