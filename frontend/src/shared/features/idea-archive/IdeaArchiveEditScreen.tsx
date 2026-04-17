import { useQuery } from '@powersync/react';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { Select } from '../../components/ui/Select';
import { IconButton } from '../../components/ui/IconButton';
import { MainPanelHeader } from '../../components/layout/MainPanelHeader';
import { ContentEditor } from '../../components/editor/ContentEditor';

interface IdeaArchiveEditScreenProps {
  id: string;
  onBack: () => void;
}

interface IdeaRow {
  id: string;
  content: string | null;
  tag: string | null;
}

const TAG_OPTIONS = [
  { value: '', label: '태그 없음' },
  { value: '문장', label: '문장' },
  { value: '장면', label: '장면' },
  { value: '설정', label: '설정' },
  { value: '반전', label: '반전' },
  { value: '대사', label: '대사' },
];

export function IdeaArchiveEditScreen({ id, onBack }: IdeaArchiveEditScreenProps) {
  const { data: rows = [] } = useQuery<IdeaRow>(
    `SELECT id, content, tag FROM idea_archive WHERE id = ?`,
    [id],
  );
  const { updateIdea } = useLocalWrite();
  const idea = rows[0];

  if (!idea) {
    return <div className="p-8 text-sm text-muted-foreground">아이디어를 불러오는 중…</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <MainPanelHeader
        leading={<IconButton onClick={onBack} title="목록으로">←</IconButton>}
        title={<span className="text-sm font-medium text-foreground">아이디어</span>}
        trailing={
          <div className="w-40">
            <Select
              options={TAG_OPTIONS}
              value={idea.tag ?? ''}
              onChange={(e) => void updateIdea(id, { tag: e.target.value || null })}
            />
          </div>
        }
      />
      <ContentEditor
        itemId={id}
        initialContent={idea.content}
        placeholder="떠오른 아이디어를 자유롭게 적어두세요…"
        onUpdate={(content) => void updateIdea(id, { content })}
      />
    </div>
  );
}
