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
  disabled,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cn(
        'h-6 w-6 shrink-0 rounded flex items-center justify-center text-muted-foreground transition-colors',
        !disabled && 'hover:bg-accent hover:text-accent-foreground',
        active && !disabled && 'bg-accent text-accent-foreground',
        disabled && 'opacity-40 cursor-default',
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
 * 다중 에디터 화면(WorldNote hierarchy 등) 상단의 sticky 툴바.
 * 글로벌 토글이 ON이면 항상 노출. 포커스된 에디터가 없으면 disabled 상태로 표시.
 * 사용자가 에디터를 한 번이라도 포커스하면 마지막 포커스 에디터에 명령 전달
 * (blur 시 등록 해제하지 않음 — 항상 동작 가능하게).
 *
 * inline 에디터에 없는 확장(SceneBreak/AuthorNote/Link 등)은 제외 — 핵심 포맷만.
 */
export function SharedEditorToolbar() {
  const visible = useEditorToolbarStore((s) => s.visible);
  const editor = useFocusedEditor();
  useForce(editor);

  if (!visible) return null;

  const disabled = !editor;
  // chain().focus()가 active editor를 다시 포커스 — 툴바 클릭으로 인한 blur 회복
  const c = () => editor!.chain().focus();
  // TipTap isActive는 다양한 오버로드 — disabled 시 false로 단락 평가
  const isActive = (name: string, attrs?: Record<string, unknown>): boolean => {
    if (!editor) return false;
    return attrs ? editor.isActive(name, attrs) : editor.isActive(name);
  };
  const isAlign = (align: 'left' | 'center' | 'right'): boolean =>
    editor ? editor.isActive({ textAlign: align }) : false;

  return (
    <div className="sticky top-0 z-20 flex h-9 items-center gap-0.5 overflow-x-auto scrollbar-none border-b border-border bg-background px-2">
      {/* Text formatting */}
      <Btn
        disabled={disabled}
        active={isActive('bold')}
        onClick={() => !disabled && c().toggleBold().run()}
        title="굵게 (Ctrl+B)"
      >
        <Bold size={iconSize} />
      </Btn>
      <Btn
        disabled={disabled}
        active={isActive('italic')}
        onClick={() => !disabled && c().toggleItalic().run()}
        title="기울임 (Ctrl+I)"
      >
        <Italic size={iconSize} />
      </Btn>
      <Btn
        disabled={disabled}
        active={isActive('strike')}
        onClick={() => !disabled && c().toggleStrike().run()}
        title="취소선"
      >
        <Strikethrough size={iconSize} />
      </Btn>
      <Btn
        disabled={disabled}
        active={isActive('highlight')}
        onClick={() => !disabled && (c() as any).toggleHighlight().run()}
        title="형광펜"
      >
        <Highlighter size={iconSize} />
      </Btn>

      <Sep />

      {/* Structure */}
      <Btn
        disabled={disabled}
        active={isActive('heading', { level: 2 })}
        onClick={() => !disabled && c().toggleHeading({ level: 2 }).run()}
        title="제목 2"
      >
        <Heading2 size={iconSize} />
      </Btn>
      <Btn
        disabled={disabled}
        active={isActive('heading', { level: 3 })}
        onClick={() => !disabled && c().toggleHeading({ level: 3 }).run()}
        title="제목 3"
      >
        <Heading3 size={iconSize} />
      </Btn>
      <Btn
        disabled={disabled}
        active={isActive('blockquote')}
        onClick={() => !disabled && c().toggleBlockquote().run()}
        title="인용"
      >
        <Quote size={iconSize} />
      </Btn>

      <Sep />

      {/* Lists */}
      <Btn
        disabled={disabled}
        active={isActive('bulletList')}
        onClick={() => !disabled && c().toggleBulletList().run()}
        title="글머리 기호"
      >
        <List size={iconSize} />
      </Btn>
      <Btn
        disabled={disabled}
        active={isActive('orderedList')}
        onClick={() => !disabled && c().toggleOrderedList().run()}
        title="번호 매기기"
      >
        <ListOrdered size={iconSize} />
      </Btn>

      <Sep />

      {/* Align */}
      <Btn
        disabled={disabled}
        active={isAlign('left')}
        onClick={() => !disabled && (c() as any).setTextAlign('left').run()}
        title="왼쪽 정렬"
      >
        <AlignLeft size={iconSize} />
      </Btn>
      <Btn
        disabled={disabled}
        active={isAlign('center')}
        onClick={() => !disabled && (c() as any).setTextAlign('center').run()}
        title="가운데 정렬"
      >
        <AlignCenter size={iconSize} />
      </Btn>
      <Btn
        disabled={disabled}
        active={isAlign('right')}
        onClick={() => !disabled && (c() as any).setTextAlign('right').run()}
        title="오른쪽 정렬"
      >
        <AlignRight size={iconSize} />
      </Btn>

      <Sep />

      {/* History */}
      <Btn
        disabled={disabled}
        onClick={() => !disabled && c().undo().run()}
        title="되돌리기 (Ctrl+Z)"
      >
        <Undo2 size={iconSize} />
      </Btn>
      <Btn
        disabled={disabled}
        onClick={() => !disabled && c().redo().run()}
        title="다시 실행"
      >
        <Redo2 size={iconSize} />
      </Btn>
    </div>
  );
}
