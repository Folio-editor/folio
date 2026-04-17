import { useQuery } from '@powersync/react';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { useDeferredText } from '../../hooks/useDeferredText';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { IconButton } from '../../components/ui/IconButton';
import { MainPanelHeader } from '../../components/layout/MainPanelHeader';
import { ContentEditor } from '../../components/editor/ContentEditor';

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

  return (
    <div className="flex h-full flex-col">
      <MainPanelHeader
        leading={<IconButton onClick={onBack} title="목록으로">←</IconButton>}
        title={
          <Input
            value={title.value}
            onChange={(e) => title.onChange(e.target.value)}
            onBlur={title.onBlur}
            placeholder="회차 제목"
            className="border-none px-0 text-base font-medium shadow-none focus-visible:ring-0"
          />
        }
        trailing={
          <>
            <span className="text-xs text-muted-foreground">{item.word_count.toLocaleString()}자</span>
            <div className="w-28">
              <Select
                options={STATUS_OPTIONS}
                value={item.status}
                onChange={(e) => void updateEpisode(id, { status: e.target.value })}
              />
            </div>
          </>
        }
      />
      <ContentEditor
        itemId={id}
        initialContent={item.content}
        placeholder="본문을 작성하세요…"
        onUpdate={(content) => void updateEpisode(id, { content })}
        onCharCountChange={(count) => void updateEpisode(id, { word_count: count })}
      />
    </div>
  );
}
