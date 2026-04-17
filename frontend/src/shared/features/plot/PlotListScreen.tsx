import { useQuery } from '@powersync/react';
import { useWriterId } from '../../hooks/useWriterId';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { Button } from '../../components/ui/Button';
import { SectionHeader } from '../../components/layout/SectionHeader';

interface PlotListScreenProps {
  workId: string;
  onSelect: (id: string) => void;
}

interface PlotRow {
  id: string;
  title: string;
  status: string | null;
}

const STATUS_COLOR: Record<string, string> = {
  '예정': 'bg-gray-100 text-gray-600',
  '작성중': 'bg-blue-100 text-blue-700',
  '완료': 'bg-green-100 text-green-700',
};

export function PlotListScreen({ workId, onSelect }: PlotListScreenProps) {
  const writerId = useWriterId();
  const { createPlot } = useLocalWrite();
  const { data: items = [] } = useQuery<PlotRow>(
    `SELECT id, title, status FROM plot
     WHERE work_id = ? AND writer_id = ?
     ORDER BY sort_order ASC, created_at ASC`,
    [workId, writerId],
  );

  const handleNew = async () => {
    const id = await createPlot(workId, `${items.length + 1}회 플롯`, items.length);
    onSelect(id);
  };

  return (
    <div className="flex h-full flex-col">
      <SectionHeader
        title="플롯"
        description="줄거리 구조와 회차별 전개를 설계합니다"
        actions={<Button onClick={() => void handleNew()}>+ 새 플롯</Button>}
      />
      <div className="flex-1 overflow-y-auto p-6">
        {items.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400">아직 플롯이 없습니다.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:border-blue-400 hover:shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 text-xs text-gray-400">#{idx + 1}</span>
                  <span className="text-sm font-medium text-gray-800">{item.title}</span>
                </div>
                {item.status && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLOR[item.status] ?? 'bg-gray-100'}`}
                  >
                    {item.status}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
