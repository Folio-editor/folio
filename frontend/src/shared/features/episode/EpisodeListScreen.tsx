import { useQuery } from '@powersync/react';
import { useWriterId } from '../../hooks/useWriterId';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { Button } from '../../components/ui/Button';
import { SectionHeader } from '../../components/layout/SectionHeader';

interface EpisodeListScreenProps {
  workId: string;
  onSelect: (id: string) => void;
}

interface EpisodeRow {
  id: string;
  title: string;
  status: string;
  word_count: number;
}

const STATUS_COLOR: Record<string, string> = {
  '미작성': 'bg-gray-100 text-gray-500',
  '초고': 'bg-yellow-100 text-yellow-700',
  '퇴고': 'bg-blue-100 text-blue-700',
  '완성': 'bg-green-100 text-green-700',
};

export function EpisodeListScreen({ workId, onSelect }: EpisodeListScreenProps) {
  const writerId = useWriterId();
  const { createEpisode } = useLocalWrite();
  const { data: items = [] } = useQuery<EpisodeRow>(
    `SELECT id, title, status, word_count FROM episode
     WHERE work_id = ? AND writer_id = ?
     ORDER BY sort_order ASC, created_at ASC`,
    [workId, writerId],
  );

  const handleNew = async () => {
    const id = await createEpisode(workId, `${items.length + 1}화`, items.length);
    onSelect(id);
  };

  return (
    <div className="flex h-full flex-col">
      <SectionHeader
        title="원고"
        description="실제 본문을 집필합니다"
        actions={<Button onClick={() => void handleNew()}>+ 새 회차</Button>}
      />
      <div className="flex-1 overflow-y-auto p-6">
        {items.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400">아직 회차가 없습니다.</p>
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
                  <span className="w-8 text-xs text-gray-400">#{idx + 1}</span>
                  <span className="text-sm font-medium text-gray-800">{item.title}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">
                    {item.word_count.toLocaleString()}자
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLOR[item.status] ?? 'bg-gray-100'}`}
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
