import { useMemo, useState } from 'react';
import { useQuery } from '@powersync/react';
import { Plus } from 'lucide-react';
import { useWriterId } from '../../hooks/useWriterId';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { Button } from '../../components/ui/Button';
import { MainPanelHeader } from '../../components/layout/MainPanelHeader';
import { ForeshadowLifecycleStepper } from './ForeshadowLifecycleStepper';
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
}

const IMPORTANCE_COLOR: Record<string, string> = {
  '상': 'bg-danger-soft text-danger',
  '중': 'bg-warning-soft text-warning',
  '하': 'bg-muted text-muted-foreground',
};

const STATUS_COLOR: Record<string, string> = {
  '진행중': 'bg-info-soft text-info',
  '완결': 'bg-success-soft text-success',
  '폐기': 'bg-muted text-muted-foreground',
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
    `SELECT fl.foreshadow_id, fl.link_type FROM foreshadow_link fl`,
  );

  const countsByForeshadow = useMemo(() => {
    const map = new Map<string, { plant: number; resolve: number; final: number }>();
    for (const l of links) {
      let entry = map.get(l.foreshadow_id);
      if (!entry) {
        entry = { plant: 0, resolve: 0, final: 0 };
        map.set(l.foreshadow_id, entry);
      }
      if (l.link_type === 'plant') entry.plant++;
      else if (l.link_type === 'resolve') entry.resolve++;
      else if (l.link_type === 'final_resolve') entry.final++;
    }
    return map;
  }, [links]);

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

                {/* 라이프사이클 진행도 (mini) */}
                {(() => {
                  const c = countsByForeshadow.get(item.id) ?? { plant: 0, resolve: 0, final: 0 };
                  return (
                    <div className="mt-3 w-full">
                      <ForeshadowLifecycleStepper
                        plant={c.plant}
                        resolve={c.resolve}
                        final={c.final}
                        status={item.status}
                        compact
                      />
                    </div>
                  );
                })()}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
