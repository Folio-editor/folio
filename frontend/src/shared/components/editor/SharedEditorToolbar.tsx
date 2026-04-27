import { useEffect, useReducer } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Strikethrough,
  Highlighter,
  Heading2,
  Heading3,
  Quote,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo2,
  Redo2,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { useFocusedEditor } from '../../stores/focusedEditorStore';
import { useEditorToolbarStore } from '../../stores/editorToolbarStore';

const iconSize = 14;

function Sep() {
  return <div className="mx-0.5 h-4 w-px bg-border" />;
}

function Btn({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'h-6 w-6 shrink-0 rounded flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors',
        active && 'bg-accent text-accent-foreground',
      )}
    >
      {children}
    </button>
  );
}

/** editor 트랜잭션마다 active 상태 갱신 */
function useForce(editor: Editor | null) {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!editor) return;
    editor.on('transaction', force);
    return () => {
      editor.off('transaction', force);
    };
  }, [editor]);
}

/**
 * 다중 에디터 화면(WorldNote hierarchy / AuxDocViewer) 상단의 sticky 툴바.
 * focusedEditorStore의 active editor에 명령 전달 — Notion/Coda 패턴.
 *
 * 글로벌 토글 OFF거나 active editor 없으면 렌더 X (시각 노이즈 0).
 * inline 에디터에 없는 확장(SceneBreak/AuthorNote/Link 등)은 제외 — 핵심 포맷만.
 */
export function SharedEditorToolbar() {
  const visible = useEditorToolbarStore((s) => s.visible);
  const editor = useFocusedEditor();
  useForce(editor);

  if (!visible || !editor) return null;

  // chain().focus()가 active editor를 다시 포커스 — 툴바 클릭으로 인한 blur 회복
  const c = () => editor.chain().focus();

  return (
    <div className="sticky top-0 z-20 flex h-9 items-center gap-0.5 overflow-x-auto scrollbar-none border-b border-border bg-background px-2">
      {/* Text formatting */}
      <Btn
        active={editor.isActive('bold')}
        onClick={() => c().toggleBold().run()}
        title="굵게 (Ctrl+B)"
      >
        <Bold size={iconSize} />
      </Btn>
      <Btn
        active={editor.isActive('italic')}
        onClick={() => c().toggleItalic().run()}
        title="기울임 (Ctrl+I)"
      >
        <Italic size={iconSize} />
      </Btn>
      <Btn
        active={editor.isActive('strike')}
        onClick={() => c().toggleStrike().run()}
        title="취소선"
      >
        <Strikethrough size={iconSize} />
      </Btn>
      <Btn
        active={editor.isActive('highlight')}
        onClick={() => (c() as any).toggleHighlight().run()}
        title="형광펜"
      >
        <Highlighter size={iconSize} />
      </Btn>

      <Sep />

      {/* Structure */}
      <Btn
        active={editor.isActive('heading', { level: 2 })}
        onClick={() => c().toggleHeading({ level: 2 }).run()}
        title="제목 2"
      >
        <Heading2 size={iconSize} />
      </Btn>
      <Btn
        active={editor.isActive('heading', { level: 3 })}
        onClick={() => c().toggleHeading({ level: 3 }).run()}
        title="제목 3"
      >
        <Heading3 size={iconSize} />
      </Btn>
      <Btn
        active={editor.isActive('blockquote')}
        onClick={() => c().toggleBlockquote().run()}
        title="인용"
      >
        <Quote size={iconSize} />
      </Btn>

      <Sep />

      {/* Lists */}
      <Btn
        active={editor.isActive('bulletList')}
        onClick={() => c().toggleBulletList().run()}
        title="글머리 기호"
      >
        <List size={iconSize} />
      </Btn>
      <Btn
        active={editor.isActive('orderedList')}
        onClick={() => c().toggleOrderedList().run()}
        title="번호 매기기"
      >
        <ListOrdered size={iconSize} />
      </Btn>

      <Sep />

      {/* Align */}
      <Btn
        active={editor.isActive({ textAlign: 'left' })}
        onClick={() => (c() as any).setTextAlign('left').run()}
        title="왼쪽 정렬"
      >
        <AlignLeft size={iconSize} />
      </Btn>
      <Btn
        active={editor.isActive({ textAlign: 'center' })}
        onClick={() => (c() as any).setTextAlign('center').run()}
        title="가운데 정렬"
      >
        <AlignCenter size={iconSize} />
      </Btn>
      <Btn
        active={editor.isActive({ textAlign: 'right' })}
        onClick={() => (c() as any).setTextAlign('right').run()}
        title="오른쪽 정렬"
      >
        <AlignRight size={iconSize} />
      </Btn>

      <Sep />

      {/* History */}
      <Btn onClick={() => c().undo().run()} title="되돌리기 (Ctrl+Z)">
        <Undo2 size={iconSize} />
      </Btn>
      <Btn onClick={() => c().redo().run()} title="다시 실행">
        <Redo2 size={iconSize} />
      </Btn>
    </div>
  );
}
