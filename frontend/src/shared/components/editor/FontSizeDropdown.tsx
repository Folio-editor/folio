import type { Editor } from '@tiptap/react';
import { ChevronDown } from 'lucide-react';
import { Popover } from '../ui/Popover';
import { cn } from '../../lib/cn';

interface FontSizeDropdownProps {
  editor: Editor;
  triggerClassName?: string;
}

const SIZES = ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px'];

/**
 * 부분 선택 텍스트의 글자 크기 변경.
 * TextStyle + FontSize extension 필요.
 */
export function FontSizeDropdown({
  editor,
  triggerClassName,
}: FontSizeDropdownProps) {
  const current = (editor.getAttributes('textStyle') as { fontSize?: string })
    .fontSize ?? '';

  return (
    <Popover
      align="start"
      trigger={
        <button
          type="button"
          title="글자 크기"
          className={cn(
            'flex h-7 shrink-0 items-center gap-1 rounded px-2 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors',
            triggerClassName,
          )}
        >
          <span className="font-mono">{current || '크기'}</span>
          <ChevronDown size={12} />
        </button>
      }
    >
      {(close) => (
        <div className="flex flex-col gap-0.5 p-1 min-w-24">
          <button
            type="button"
            onClick={() => {
              (editor.chain().focus() as any).unsetFontSize().run();
              close();
            }}
            className={cn(
              'rounded px-2 py-1 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground',
              !current && 'bg-accent text-accent-foreground',
            )}
          >
            기본
          </button>
          {SIZES.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => {
                (editor.chain().focus() as any).setFontSize(size).run();
                close();
              }}
              className={cn(
                'rounded px-2 py-1 text-left text-xs font-mono transition-colors hover:bg-accent hover:text-accent-foreground',
                current === size && 'bg-accent text-accent-foreground',
              )}
            >
              {size}
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}
