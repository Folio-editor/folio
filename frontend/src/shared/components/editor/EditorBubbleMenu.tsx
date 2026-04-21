import { useEffect, useReducer } from 'react';
import type { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Highlighter,
} from 'lucide-react';
import { cn } from '../../lib/cn';

interface EditorBubbleMenuProps {
  editor: Editor;
}

const iconSize = 14;

function BubbleButton({
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
        'h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors',
        active && 'bg-accent text-accent-foreground',
      )}
    >
      {children}
    </button>
  );
}

export default function EditorBubbleMenu({ editor }: EditorBubbleMenuProps) {
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    editor.on('transaction', forceUpdate);
    return () => { editor.off('transaction', forceUpdate); };
  }, [editor, forceUpdate]);

  return (
    <BubbleMenu
      editor={editor}
      className="rounded-lg shadow-lg border border-border bg-popover p-1 flex gap-0.5"
    >
      <BubbleButton
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="굵게"
      >
        <Bold size={iconSize} />
      </BubbleButton>
      <BubbleButton
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="기울임"
      >
        <Italic size={iconSize} />
      </BubbleButton>
      <BubbleButton
        active={editor.isActive('underline')}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        title="밑줄"
      >
        <Underline size={iconSize} />
      </BubbleButton>
      <BubbleButton
        active={editor.isActive('strike')}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        title="취소선"
      >
        <Strikethrough size={iconSize} />
      </BubbleButton>
      <BubbleButton
        active={editor.isActive('highlight')}
        onClick={() => (editor.chain().focus() as any).toggleHighlight().run()}
        title="형광펜"
      >
        <Highlighter size={iconSize} />
      </BubbleButton>
    </BubbleMenu>
  );
}
