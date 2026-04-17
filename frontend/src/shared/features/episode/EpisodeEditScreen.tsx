import { useQuery } from '@powersync/react';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { useDeferredText } from '../../hooks/useDeferredText';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { IconButton } from '../../components/ui/IconButton';
import { ContentEditor } from '../../components/ui/ContentEditor';

interface EpisodeEditScreenProps {
  id: string;
  onBack: () => void;
}

interface EpisodeRow {
  id: string;
  title: string;
  status: string;
  content: string | null;
  word_count: number;
}

const STATUS_OPTIONS = [
  { value: '미작성', label: '미작성' },
  { value: '초고', label: '초고' },
  { value: '퇴고', label: '퇴고' },
  { value: '완성', label: '완성' },
];

export function EpisodeEditScreen({ id, onBack }: EpisodeEditScreenProps) {
  const { data: rows = [] } = useQuery<EpisodeRow>(
    `SELECT id, title, status, content, word_count FROM episode WHERE id = ?`,
    [id],
  );
  const item = rows[0];

  if (!item) {
    return <div className="p-8 text-sm text-muted-foreground">회차를 불러오는 중…</div>;
  }

  return <EpisodeEditor key={id} item={item} onBack={onBack} />;
}

function EpisodeEditor({ item, onBack }: { item: EpisodeRow; onBack: () => void }) {
  const { updateEpisode } = useLocalWrite();
  const { id } = item;

  const title = useDeferredText(id, item.title, (v) => void updateEpisode(id, { title: v }));

  const handleContent = (content: string) => {
    const wordCount = countWords(content);
    void updateEpisode(id, { content, word_count: wordCount });
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <IconButton onClick={onBack} title="목록으로">
          ←
        </IconButton>
        <Input
          value={title.value}
          onChange={(e) => title.onChange(e.target.value)}
          onBlur={title.onBlur}
          placeholder="회차 제목"
          className="flex-1 border-none px-0 text-base font-medium focus:ring-0"
        />
        <span className="text-xs text-muted-foreground">{item.word_count.toLocaleString()}자</span>
        <div className="w-28">
          <Select
            options={STATUS_OPTIONS}
            value={item.status}
            onChange={(e) => void updateEpisode(id, { status: e.target.value })}
          />
        </div>
      </header>
      <ContentEditor
        itemId={id}
        initialContent={item.content}
        placeholder="본문을 작성하세요…"
        onUpdate={handleContent}
      />
    </div>
  );
}

/**
 * TipTap JSON에서 텍스트를 추출해 글자 수(공백 제외)를 계산.
 */
function countWords(json: string): number {
  if (!json) return 0;
  try {
    const parsed = JSON.parse(json);
    return collectText(parsed).replace(/\s/g, '').length;
  } catch {
    return json.replace(/\s/g, '').length;
  }
}

function collectText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as { text?: string; content?: unknown[] };
  if (typeof n.text === 'string') return n.text;
  if (Array.isArray(n.content)) return n.content.map(collectText).join('');
  return '';
}
