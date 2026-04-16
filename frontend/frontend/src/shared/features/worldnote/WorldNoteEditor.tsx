import { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';

interface WorldNoteEditorProps {
  noteId: string;
  initialContent: string | null;
  onUpdate: (content: string) => void;
}

const DEBOUNCE_MS = 1000;

/**
 * TipTap 기반 세계관 문서 에디터.
 * - 변경 후 1초 debounce → onUpdate(JSON string) 호출
 * - noteId가 바뀌면 에디터 콘텐츠를 초기화
 */
export function WorldNoteEditor({ noteId, initialContent, onUpdate }: WorldNoteEditorProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: '여기에 세계관 내용을 작성하세요…' }),
    ],
    content: parseContent(initialContent),
    onUpdate: ({ editor }) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const json = JSON.stringify(editor.getJSON());
        onUpdate(json);
      }, DEBOUNCE_MS);
    },
  });

  // noteId 변경 시 콘텐츠 교체
  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(parseContent(initialContent), false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  // 언마운트 시 debounce 정리
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <EditorContent
      editor={editor}
      className="prose prose-sm max-w-none flex-1 overflow-y-auto px-8 py-6 focus:outline-none [&_.tiptap]:min-h-full [&_.tiptap]:outline-none [&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none [&_.tiptap_p.is-editor-empty:first-child::before]:float-left [&_.tiptap_p.is-editor-empty:first-child::before]:h-0 [&_.tiptap_p.is-editor-empty:first-child::before]:text-gray-400 [&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]"
    />
  );
}

function parseContent(raw: string | null) {
  if (!raw) return '';
  try {
    return JSON.parse(raw) as object;
  } catch {
    return raw;
  }
}
