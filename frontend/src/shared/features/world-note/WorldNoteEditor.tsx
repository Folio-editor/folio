import { ContentEditor } from '../../components/editor/ContentEditor';

interface WorldNoteEditorProps {
  noteId: string;
  initialContent: string | null;
  onUpdate: (content: string) => void;
}

/**
 * 세계관 문서 본문 에디터.
 * 공통 ContentEditor를 그대로 위임한다.
 */
export function WorldNoteEditor({ noteId, initialContent, onUpdate }: WorldNoteEditorProps) {
  return (
    <ContentEditor
      itemId={noteId}
      initialContent={initialContent}
      placeholder="여기에 세계관 내용을 작성하세요…"
      onUpdate={onUpdate}
    />
  );
}
