import { useQuery } from '@powersync/react';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { DeleteConfirmDialog } from '../../components/ui/DeleteConfirmDialog';
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
  created_at: string;
}

const TAG_OPTIONS = [
  { value: '', label: '태그 없음' },
  { value: '문장', label: '문장' },
  { value: '장면', label: '장면' },
  { value: '설정', label: '설정' },
  { value: '반전', label: '반전' },
  { value: '대사', label: '대사' },
];

const TAG_DOT_COLOR: Record<string, string> = {
  '문장': 'bg-amber-400',
  '장면': 'bg-blue-400',
  '설정': 'bg-purple-400',
  '반전': 'bg-red-400',
  '대사': 'bg-green-400',
};

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

export function IdeaArchiveEditScreen({ id, onBack }: IdeaArchiveEditScreenProps) {
  const { data: rows = [] } = useQuery<IdeaRow>(
    `SELECT id, content, tag, created_at FROM idea_archive WHERE id = ?`,
    [id],
  );
  const { updateIdea, deleteIdeaArchive } = useLocalWrite();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const idea = rows[0];

  if (!idea) {
    return <div className="p-8 text-sm text-muted-foreground">아이디어를 불러오는 중…</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <MainPanelHeader
        leading={
          <IconButton onClick={onBack} title="목록으로">
            <ArrowLeft className="h-4 w-4" />
          </IconButton>
        }
        title={<span className="text-sm font-medium text-foreground">아이디어</span>}
        trailing={
          <div className="flex items-center gap-2">
            {idea.tag && (
              <span className={`h-2.5 w-2.5 rounded-full ${TAG_DOT_COLOR[idea.tag] ?? ''}`} />
            )}
            <div className="w-40">
              <Select
                options={TAG_OPTIONS}
                value={idea.tag ?? ''}
                onChange={(e) => void updateIdea(id, { tag: e.target.value || null })}
              />
            </div>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              title="아이디어 삭제"
              className="rounded p-2 text-muted-foreground hover:bg-destructive/5 hover:text-destructive"
            >
              <Trash2 size={16} strokeWidth={1.75} />
            </button>
          </div>
        }
        meta={
          idea.created_at ? (
            <span className="text-xs text-muted-foreground">
              생성 {formatDate(idea.created_at)}
            </span>
          ) : undefined
        }
      />
      <ContentEditor
        itemId={id}
        initialContent={idea.content}
        placeholder="떠오른 아이디어를 자유롭게 적어두세요…"
        onUpdate={(content) => void updateIdea(id, { content })}
      />

      {confirmDelete && (
        <DeleteConfirmDialog
          title="아이디어 삭제"
          message="이 아이디어가 영구 삭제됩니다."
          busy={deleteBusy}
          onConfirm={() => {
            setDeleteBusy(true);
            void deleteIdeaArchive(id).then(() => {
              setDeleteBusy(false);
              setConfirmDelete(false);
              onBack();
            });
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
