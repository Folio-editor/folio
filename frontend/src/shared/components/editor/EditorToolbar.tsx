import { useEffect, useReducer, useState } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Underline,
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
  Minus,
  StickyNote,
  Link,
  Undo2,
  Redo2,
  Search,
  HelpCircle,
  Settings,
} from 'lucide-react';
import { cn } from '../../lib/cn';

interface EditorToolbarProps {
  editor: Editor | null;
  onToggleFindReplace?: () => void;
  onToggleShortcutHelp?: () => void;
  onToggleSettings?: () => void;
}

const iconSize = 15;

function Separator() {
  return <div className="mx-1 h-4 w-px bg-border" />;
}

function ToolbarButton({
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
        'h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors',
        active && 'bg-accent text-accent-foreground',
      )}
    >
      {children}
    </button>
  );
}

/** editor 트랜잭션(포맷 토글, 선택 변경 등)마다 re-render를 강제한다. */
function useEditorForceUpdate(editor: Editor | null) {
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!editor) return;
    editor.on('transaction', forceUpdate);
    return () => {
      editor.off('transaction', forceUpdate);
    };
  }, [editor, forceUpdate]);
}

export default function EditorToolbar({
  editor,
  onToggleFindReplace,
  onToggleShortcutHelp,
  onToggleSettings,
}: EditorToolbarProps) {
  const [linkInput, setLinkInput] = useState<string | null>(null);
  useEditorForceUpdate(editor);

  if (!editor) return null;

  return (
    <div className="flex h-9 items-center border-b border-border px-2 gap-0.5">
      {/* Text formatting */}
      <ToolbarButton
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="굵게 (Ctrl+B)"
      >
        <Bold size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="기울임 (Ctrl+I)"
      >
        <Italic size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('underline')}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        title="밑줄 (Ctrl+U)"
      >
        <Underline size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('strike')}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        title="취소선 (Ctrl+Shift+X)"
      >
        <Strikethrough size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('highlight')}
        onClick={() => (editor.chain().focus() as any).toggleHighlight().run()}
        title="형광펜 (Ctrl+Shift+H)"
      >
        <Highlighter size={iconSize} />
      </ToolbarButton>

      <Separator />

      {/* Structure */}
      <ToolbarButton
        active={editor.isActive('heading', { level: 2 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 2 }).run()
        }
        title="제목 2"
      >
        <Heading2 size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('heading', { level: 3 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 3 }).run()
        }
        title="제목 3"
      >
        <Heading3 size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        title="인용"
      >
        <Quote size={iconSize} />
      </ToolbarButton>

      <Separator />

      {/* Lists */}
      <ToolbarButton
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="글머리 기호"
      >
        <List size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="번호 매기기"
      >
        <ListOrdered size={iconSize} />
      </ToolbarButton>

      <Separator />

      {/* Align */}
      <ToolbarButton
        active={editor.isActive({ textAlign: 'left' })}
        onClick={() => (editor.chain().focus() as any).setTextAlign('left').run()}
        title="왼쪽 정렬"
      >
        <AlignLeft size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive({ textAlign: 'center' })}
        onClick={() => (editor.chain().focus() as any).setTextAlign('center').run()}
        title="가운데 정렬"
      >
        <AlignCenter size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive({ textAlign: 'right' })}
        onClick={() => (editor.chain().focus() as any).setTextAlign('right').run()}
        title="오른쪽 정렬"
      >
        <AlignRight size={iconSize} />
      </ToolbarButton>

      <Separator />

      {/* Scene break */}
      <ToolbarButton
        active={false}
        onClick={() => (editor.chain().focus() as any).insertSceneBreak().run()}
        title="장면 전환"
      >
        <Minus size={iconSize} />
      </ToolbarButton>

      <Separator />

      {/* Author note & Link */}
      <ToolbarButton
        active={editor.isActive('authorNote')}
        onClick={() => (editor.chain().focus() as any).toggleAuthorNote().run()}
        title="작가 메모 (Ctrl+Shift+M)"
      >
        <StickyNote size={iconSize} />
      </ToolbarButton>
      <div className="relative">
        <ToolbarButton
          active={editor.isActive('link')}
          onClick={() => {
            if (editor.isActive('link')) {
              editor.chain().focus().unsetLink().run();
            } else {
              setLinkInput('');
            }
          }}
          title="링크"
        >
          <Link size={iconSize} />
        </ToolbarButton>
        {linkInput !== null && (
          <div className="absolute left-0 top-full z-50 mt-1 flex items-center gap-1 rounded-md border border-border bg-popover p-1 shadow-lg">
            <input
              type="url"
              autoFocus
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && linkInput.trim()) {
                  editor.chain().focus().setLink({ href: linkInput.trim() }).run();
                  setLinkInput(null);
                }
                if (e.key === 'Escape') {
                  setLinkInput(null);
                  editor.chain().focus().run();
                }
              }}
              placeholder="URL 입력 후 Enter"
              className="h-6 w-48 rounded border-none bg-transparent px-2 text-xs text-foreground outline-none placeholder:text-muted-foreground"
            />
            <button
              type="button"
              onClick={() => {
                if (linkInput.trim()) {
                  editor.chain().focus().setLink({ href: linkInput.trim() }).run();
                }
                setLinkInput(null);
              }}
              className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent"
            >
              확인
            </button>
          </div>
        )}
      </div>

      <Separator />

      {/* History */}
      <ToolbarButton
        active={false}
        onClick={() => editor.chain().focus().undo().run()}
        title="되돌리기 (Ctrl+Z)"
      >
        <Undo2 size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        active={false}
        onClick={() => editor.chain().focus().redo().run()}
        title="다시 실행 (Ctrl+Shift+Z)"
      >
        <Redo2 size={iconSize} />
      </ToolbarButton>

      {/* Right-aligned group */}
      <div className="flex-1" />

      <ToolbarButton
        active={false}
        onClick={() => onToggleFindReplace?.()}
        title="찾기/바꾸기 (Ctrl+F)"
      >
        <Search size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        active={false}
        onClick={() => onToggleShortcutHelp?.()}
        title="단축키 안내"
      >
        <HelpCircle size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        active={false}
        onClick={() => onToggleSettings?.()}
        title="설정"
      >
        <Settings size={iconSize} />
      </ToolbarButton>
    </div>
  );
}
