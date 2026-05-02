import { useQuery } from '@powersync/react';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { useDecryptedPlanNoteList } from '../../hooks/useDecryptedPlanNote';
import { ContentEditor } from '../../components/editor/ContentEditor';
import { PlanHeader } from './PlanHeader';

interface PlanSectionShellProps {
  /**
   * Stage Manager 모델에서 mainDoc.section='plan' + mainDoc.itemId 일 때만 진입.
   * itemId는 plan_note의 id이며, 여기서는 해당 노트의 본문 에디터만 렌더한다.
   *
   * 메타데이터(slogan/genres/moods/target_audience)는 plan 테이블에 컬럼으로 존속하지만
   * 현재 UI에서는 표시·편집하지 않는다 (서비스 보류). 차후 재노출 시 PR-A의 ERD 이전과 함께 재설계.
   */
  workId: string;
  selectedItemId: string | null;
  onItemBack: () => void;
  onSendToRight?: () => void;
}

interface RawPlanNoteJoinRow {
  id: string;
  work_id: string;
  writer_id: string;
  title: string | null;
  content: string | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
  encrypted_dek: string | null;
}

export function PlanSectionShell({
  selectedItemId,
  onItemBack,
  onSendToRight,
}: PlanSectionShellProps) {
  const { updatePlanNoteTitle, updatePlanNoteContent, deletePlanNote } = useLocalWrite();

  const { data: rawRows = [] } = useQuery<RawPlanNoteJoinRow>(
    selectedItemId
      ? `SELECT pn.id, pn.work_id, pn.writer_id, pn.title, pn.content,
                pn.sort_order, pn.created_at, pn.updated_at,
                w.encrypted_dek AS encrypted_dek
         FROM plan_note pn
         LEFT JOIN work w ON w.id = pn.work_id
         WHERE pn.id = ? LIMIT 1`
      : `SELECT NULL AS id, NULL AS work_id, NULL AS writer_id, NULL AS title,
                NULL AS content, NULL AS sort_order, NULL AS created_at,
                NULL AS updated_at, NULL AS encrypted_dek WHERE 0`,
    selectedItemId ? [selectedItemId] : [],
  );
  const { data: decryptedNotes } = useDecryptedPlanNoteList(rawRows);
  const note = selectedItemId ? (decryptedNotes[0] ?? null) : null;

  if (!note) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        문서를 불러오는 중…
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PlanHeader
        currentNote={{
          id: note.id,
          title: note.title,
          onTitleChange: (title) => void updatePlanNoteTitle(note.id, title),
          onDelete: () => deletePlanNote(note.id),
          onBack: onItemBack,
          onSendToRight,
        }}
      />
      <div className="flex min-h-0 flex-1 flex-col">
        <ContentEditor
          key={note.id}
          itemId={note.id}
          initialContent={note.content}
          placeholder="시놉시스, 레퍼런스, 메모를 자유롭게 작성하세요…"
          onUpdate={(content) => void updatePlanNoteContent(note.id, content)}
        />
      </div>
    </div>
  );
}
