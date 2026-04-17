import { useQuery } from '@powersync/react';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { useDeferredText } from '../../hooks/useDeferredText';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { IconButton } from '../../components/ui/IconButton';
import { ContentEditor } from '../../components/ui/ContentEditor';

interface ForeshadowEditScreenProps {
  id: string;
  onBack: () => void;
}

interface ForeshadowRow {
  id: string;
  title: string;
  status: string;
  importance: string;
  content: string | null;
}

const STATUS_OPTIONS = [
  { value: '진행중', label: '진행중' },
  { value: '완결', label: '완결' },
  { value: '폐기', label: '폐기' },
];

const IMPORTANCE_OPTIONS = [
  { value: '상', label: '중요도: 상' },
  { value: '중', label: '중요도: 중' },
  { value: '하', label: '중요도: 하' },
];

export function ForeshadowEditScreen({ id, onBack }: ForeshadowEditScreenProps) {
  const { data: rows = [] } = useQuery<ForeshadowRow>(
    `SELECT id, title, status, importance, content FROM foreshadow WHERE id = ?`,
    [id],
  );
  const item = rows[0];

  if (!item) {
    return <div className="p-8 text-sm text-muted-foreground">복선을 불러오는 중…</div>;
  }

  return <ForeshadowEditor key={id} item={item} onBack={onBack} />;
}

function ForeshadowEditor({ item, onBack }: { item: ForeshadowRow; onBack: () => void }) {
  const { updateForeshadow } = useLocalWrite();
  const { id } = item;

  const title = useDeferredText(id, item.title, (v) =>
    void updateForeshadow(id, { title: v }),
  );

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
          placeholder="복선 제목"
          className="flex-1 border-none px-0 text-base font-medium focus:ring-0"
        />
        <div className="flex w-64 gap-2">
          <Select
            options={IMPORTANCE_OPTIONS}
            value={item.importance}
            onChange={(e) => void updateForeshadow(id, { importance: e.target.value })}
          />
          <Select
            options={STATUS_OPTIONS}
            value={item.status}
            onChange={(e) => void updateForeshadow(id, { status: e.target.value })}
          />
        </div>
      </header>
      <ContentEditor
        itemId={id}
        initialContent={item.content}
        placeholder="복선의 의도, 회수 시점, 관련 회차를 메모하세요…"
        onUpdate={(content) => void updateForeshadow(id, { content })}
      />
    </div>
  );
}
