import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { MainPanelHeader } from '../../components/layout/MainPanelHeader';
import { BreadcrumbTitle } from '../../components/layout/BreadcrumbTitle';
import { DeleteConfirmDialog } from '../../components/ui/DeleteConfirmDialog';
import { EditorToolbarToggle } from '../../components/editor/EditorToolbarToggle';

interface PlanHeaderProps {
  /** plan_note 가 선택된 상태면 브레드크럼 + 문서 제목 표시 */
  currentNote?: {
    id: string;
    title: string;
    onTitleChange: (title: string) => void;
    onDelete: () => Promise<void>;
    onBack: () => void;
    onSendToRight?: () => void;
  };
}

/**
 * 기획 섹션 헤더.
 * - 메인 화면: "기획" + subtitle
 * - 하위 문서 선택: "← 기획 / 문서제목"
 */
export function PlanHeader({ currentNote }: PlanHeaderProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  return (
    <>
    <MainPanelHeader
      onClose={currentNote ? currentNote.onBack : undefined}
      onSendToRight={currentNote?.onSendToRight}
      title={
        currentNote ? (
          <BreadcrumbTitle
            items={['기획']}
            trailing={
              <NoteTitleInput
                key={currentNote.id}
                title={currentNote.title}
                onTitleChange={currentNote.onTitleChange}
              />
            }
          />
        ) : (
          <span className="text-lg font-semibold text-foreground">기획</span>
        )
      }
      subtitle={currentNote ? undefined : '작품의 방향성과 정체성을 정의합니다'}
      trailing={
        currentNote ? (
          <div className="flex items-center gap-1">
            <EditorToolbarToggle />
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              title="문서 삭제"
              className="rounded p-2 text-muted-foreground hover:bg-destructive/5 hover:text-destructive"
            >
              <Trash2 size={16} strokeWidth={1.75} />
            </button>
          </div>
        ) : (
          <EditorToolbarToggle />
        )
      }
    />
    {confirmDelete && currentNote && (
      <DeleteConfirmDialog
        title="문서 삭제"
        message={`"${currentNote.title || '(제목 없음)'}" 문서가 영구 삭제됩니다.`}
        busy={deleteBusy}
        onConfirm={() => {
          setDeleteBusy(true);
          void currentNote.onDelete().then(() => {
            setDeleteBusy(false);
            setConfirmDelete(false);
            currentNote.onBack();
          });
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    )}
    </>
  );
}

function NoteTitleInput({
  title,
  onTitleChange,
}: {
  title: string;
  onTitleChange: (title: string) => void;
}) {
  const [value, setValue] = useState(title);

  const commit = () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === title) {
      setValue(title);
      return;
    }
    onTitleChange(trimmed);
  };

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setValue(title);
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
      placeholder="문서 제목"
      className="w-full bg-transparent text-base font-medium text-foreground outline-none placeholder:text-muted-foreground/50"
    />
  );
}
