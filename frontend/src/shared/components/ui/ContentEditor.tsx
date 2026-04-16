import { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { cn } from '../../lib/cn';

interface ContentEditorProps {
  /** 변경 시 에디터 콘텐츠를 교체하기 위한 키 */
  itemId: string;
  initialContent: string | null;
  placeholder?: string;
  onUpdate: (json: string) => void;
  /** debounce 시간 (ms). 0이면 즉시 호출. */
  debounceMs?: number;
  className?: string;
}

const DEFAULT_DEBOUNCE_MS = 1000;

/**
 * TipTap 기반 공통 본문 에디터.
 * - StarterKit + Placeholder
 * - 변경 후 debounce → onUpdate(JSON string) 호출
 * - itemId가 바뀌면 콘텐츠를 새로 로드
 */
export function ContentEditor({
  itemId,
  initialContent,
  placeholder = '내용을 작성하세요…',
  onUpdate,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  className,
}: ContentEditorProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [StarterKit, Placeholder.configure({ placeholder })],
      content: parseContent(initialContent),
      onUpdate: ({ editor: ed }) => {
        const emit = () => {
          const json = JSON.stringify(ed.getJSON());
          onUpdate(json);
        };
        if (debounceMs <= 0) {
          emit();
          return;
        }
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(emit, debounceMs);
      },
    },
    [],
  );

  // itemId 변경 시 콘텐츠 교체
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.commands.setContent(parseContent(initialContent), { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  // 언마운트 시 debounce 정리
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className={cn('min-h-0 flex-1 overflow-y-auto px-8 py-6', className)}>
      <EditorContent editor={editor} style={{ minHeight: '100%', outline: 'none' }} />
    </div>
  );
}

function parseContent(raw: string | null): object | string {
  if (!raw) return '';
  try {
    return JSON.parse(raw) as object;
  } catch {
    return raw;
  }
}
