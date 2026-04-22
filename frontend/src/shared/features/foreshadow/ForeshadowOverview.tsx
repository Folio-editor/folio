import { useMemo, useState } from 'react';
import { useQuery } from '@powersync/react';
import { Plus } from 'lucide-react';
import { useWriterId } from '../../hooks/useWriterId';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { Button } from '../../components/ui/Button';
import { MainPanelHeader } from '../../components/layout/MainPanelHeader';
import { TimelineGauge, type TimelineMarker } from './TimelineGauge';
import { cn } from '../../lib/cn';

interface ForeshadowOverviewProps {
  workId: string;
  onSelect: (id: string) => void;
}

interface ForeshadowRow {
  id: string;
  title: string;
  status: string;
  importance: string;
}

interface LinkRow {
  foreshadow_id: string;
  link_type: string;
  episode_sort: number | null;
  episode_title: string | null;
  plot_title: string | null;
}

interface RangeRow {
  min_order: number | null;
  max_order: number | null;
}

const IMPORTANCE_COLOR: Record<string, string> = {
  '상': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  '중': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  '하': 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

const STATUS_COLOR: Record<string, string> = {
  '진행중': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  '완결': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  '폐기': 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
};

const STATUS_FILTERS = [
  { value: null, label: '전체' },
  { value: '진행중', label: '진행중' },
  { value: '완결', label: '완결' },
  { value: '폐기', label: '폐기' },
] as const;

export function ForeshadowOverview({ workId, onSelect }: ForeshadowOverviewProps) {
  const writerId = useWriterId();
  const { createForeshadow } = useLocalWrite();
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const { data: items = [] } = useQuery<ForeshadowRow>(
    `SELECT id, title, status, importance FROM foreshadow
     WHERE work_id = ? AND writer_id = ?
     ORDER BY sort_order ASC, created_at ASC`,
    [workId, writerId],
  );

  const { data: links = [] } = useQuery<LinkRow>(
    `SELECT fl.foreshadow_id, fl.link_type,
            e.sort_order AS episode_sort, e.title AS episode_title,
            p.title AS plot_title
     FROM foreshadow_link fl
     LEFT JOIN episode e ON e.id = fl.episode_id
     LEFT JOIN plot p ON p.id = fl.plot_id`,
  );

  const { data: rangeRows = [] } = useQuery<RangeRow>(
    `SELECT MIN(sort_order) AS min_order, MAX(sort_order) AS max_order
     FROM episode WHERE work_id = ? AND writer_id = ? AND status != 'trashed'`,
    [workId, writerId],
  );

  const linksByForeshadow = useMemo(() => {
    const map = new Map<string, TimelineMarker[]>();
    for (const l of links) {
      if (!map.has(l.foreshadow_id)) map.set(l.foreshadow_id, []);
      map.get(l.foreshadow_id)!.push({
        link_type: l.link_type,
        episode_sort: l.episode_sort,
        episode_title: l.episode_title,
      });
    }
    return map;
  }, [links]);

  const range = {
    min: rangeRows[0]?.min_order ?? 0,
    max: rangeRows[0]?.max_order ?? 0,
  };

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { '진행중': 0, '완결': 0, '폐기': 0 };
    for (const item of items) {
      if (counts[item.status] !== undefined) counts[item.status]++;
    }
    return counts;
  }, [items]);

  const filtered = useMemo(
    () => (statusFilter ? items.filter((i) => i.status === statusFilter) : items),
    [items, statusFilter],
  );

  const linkSummary = (foreshadowId: string) => {
    const fLinks = linksByForeshadow.get(foreshadowId) ?? [];
    const plant = fLinks.filter((l) => l.link_type === 'plant').length;
    const resolve = fLinks.filter((l) => l.link_type === 'resolve').length;
    const final = fLinks.filter((l) => l.link_type === 'final_resolve').length;
    const parts: string[] = [];
    if (plant > 0) parts.push(`심기 ${plant}`);
    if (resolve > 0) parts.push(`강화 ${resolve}`);
    if (final > 0) parts.push(`회수 ${final}`);
    return parts.join(' · ') || null;
  };

  const handleNew = async () => {
    const id = await createForeshadow(workId, '새 복선', '중', items.length);
    onSelect(id);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MainPanelHeader
        title={<h2 className="text-lg font-semibold">복선</h2>}
        subtitle="복선의 설정과 회수를 추적합니다"
        trailing={
          <Button size="sm" onClick={() => void handleNew()}>
            <Plus className="h-4 w-4" />새 복선
          </Button>
        }
      />

      {/* 상태 필터 탭 */}
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-6 py-2">
        {STATUS_FILTERS.map((f) => {
          const count = f.value ? statusCounts[f.value] ?? 0 : items.length;
          const active = statusFilter === f.value;
          return (
            <button
              key={f.label}
              type="button"
              onClick={() => setStatusFilter(f.value)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs transition-colors',
                active
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
              )}
            >
              {f.label} ({count})
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {statusFilter ? '해당 상태의 복선이 없습니다.' : '아직 복선이 없습니다.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className={cn(
                  'flex flex-col items-start rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-ring hover:bg-primary/5',
                  item.status === '폐기' && 'opacity-50',
                )}
              >
                {/* 배지 */}
                <div className="mb-2 flex gap-1.5">
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs',
                      IMPORTANCE_COLOR[item.importance] ?? 'bg-muted',
                    )}
                  >
                    {item.importance}
                  </span>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs',
                      STATUS_COLOR[item.status] ?? 'bg-muted',
                    )}
                  >
                    {item.status}
                  </span>
                </div>

                {/* 제목 */}
                <p className="text-sm font-medium text-foreground">
                  {item.title?.trim() || '(제목 없음)'}
                </p>

                {/* 타임라인 게이지 */}
                <div className="mt-3 w-full">
                  <TimelineGauge
                    links={linksByForeshadow.get(item.id) ?? []}
                    range={range}
                  />
                </div>

                {/* 링크 요약 */}
                {linkSummary(item.id) && (
                  <p className="mt-1.5 text-[10px] text-muted-foreground">
                    {linkSummary(item.id)}
                  </p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
