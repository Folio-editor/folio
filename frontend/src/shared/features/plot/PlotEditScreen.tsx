import { useQuery } from '@powersync/react';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { useDeferredText } from '../../hooks/useDeferredText';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { IconButton } from '../../components/ui/IconButton';
import { ContentEditor } from '../../components/ui/ContentEditor';

interface PlotEditScreenProps {
  id: string;
  onBack: () => void;
}

interface PlotRow {
  id: string;
  title: string;
  status: string;
  content: string | null;
}

const STATUS_OPTIONS = [
  { value: '예정', label: '예정' },
  { value: '작성중', label: '작성중' },
  { value: '완료', label: '완료' },
];

export function PlotEditScreen({ id, onBack }: PlotEditScreenProps) {
  const { data: rows = [] } = useQuery<PlotRow>(
    `SELECT id, title, status, content FROM plot WHERE id = ?`,
    [id],
  );
  const item = rows[0];

  if (!item) {
    return <div className="p-8 text-sm text-muted-foreground">플롯을 불러오는 중…</div>;
  }

  return <PlotEditor key={id} item={item} onBack={onBack} />;
}

function PlotEditor({ item, onBack }: { item: PlotRow; onBack: () => void }) {
  const { updatePlot } = useLocalWrite();
  const { id } = item;

  const title = useDeferredText(id, item.title, (v) => void updatePlot(id, { title: v }));

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
          placeholder="플롯 제목"
          className="flex-1 border-none px-0 text-base font-medium focus:ring-0"
        />
        <div className="w-32">
          <Select
            options={STATUS_OPTIONS}
            value={item.status}
            onChange={(e) => void updatePlot(id, { status: e.target.value })}
          />
        </div>
      </header>
      <ContentEditor
        itemId={id}
        initialContent={item.content}
        placeholder="회차의 줄거리와 핵심 사건을 정리하세요…"
        onUpdate={(content) => void updatePlot(id, { content })}
      />
    </div>
  );
}
