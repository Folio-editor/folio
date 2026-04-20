import { useQuery } from '@powersync/react';
import { useWriterId } from '../../hooks/useWriterId';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { Button } from '../../components/ui/Button';
import { MainPanelHeader } from '../../components/layout/MainPanelHeader';

interface IdeaArchiveListScreenProps {
  workId: string;
  onSelect: (id: string) => void;
}

interface IdeaRow {
  id: string;
  content: string;
  tag: string | null;
  updated_at: string;
}

export function IdeaArchiveListScreen({ workId, onSelect }: IdeaArchiveListScreenProps) {
  const writerId = useWriterId();
  const { createIdea } = useLocalWrite();
  const { data: ideas = [] } = useQuery<IdeaRow>(
    `SELECT id, content, tag, updated_at FROM idea_archive
     WHERE work_id = ? AND writer_id = ?
     ORDER BY sort_order ASC, created_at DESC`,
    [workId, writerId],
  );

  const handleNew = async () => {
    const id = await createIdea(workId, '', null, ideas.length);
    onSelect(id);
  };

  return (
    <div className="flex h-full flex-col">
      <MainPanelHeader
        title={<h2 className="text-lg font-semibold">아이디어</h2>}
        subtitle="영감과 좋은 문장을 저장합니다"
        trailing={<Button onClick={() => void handleNew()}>+ 새 아이디어</Button>}
      />
      <div className="flex-1 overflow-y-auto p-6">
        {ideas.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            아직 아이디어가 없습니다.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {ideas.map((idea) => (
              <button
                key={idea.id}
                type="button"
                onClick={() => onSelect(idea.id)}
                className="flex flex-col items-start rounded-lg border border-border bg-background p-4 text-left transition-colors hover:border-ring hover:shadow-sm"
              >
                {idea.tag && (
                  <span className="mb-2 rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                    {idea.tag}
                  </span>
                )}
                <p className="line-clamp-4 text-sm text-foreground">
                  {extractText(idea.content) || '(빈 아이디어)'}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function extractText(raw: string): string {
  if (!raw) return '';
  try {
    const json = JSON.parse(raw);
    return collectText(json).trim();
  } catch {
    return raw;
  }
}

function collectText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as { text?: string; content?: unknown[] };
  if (typeof n.text === 'string') return n.text;
  if (Array.isArray(n.content)) return n.content.map(collectText).join(' ');
  return '';
}
