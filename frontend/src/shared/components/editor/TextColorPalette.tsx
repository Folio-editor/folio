import type { Editor } from '@tiptap/react';
import { Eraser, Palette } from 'lucide-react';
import { Popover } from '../ui/Popover';
import { cn } from '../../lib/cn';

interface TextColorPaletteProps {
  editor: Editor;
  iconSize?: number;
  triggerClassName?: string;
}

const COLORS: { key: string; label: string; value: string }[] = [
  { key: 'default', label: '기본',   value: 'inherit' },
  { key: 'red',     label: '빨강',   value: '#dc2626' },
  { key: 'orange',  label: '주황',   value: '#ea580c' },
  { key: 'amber',   label: '황색',   value: '#d97706' },
  { key: 'green',   label: '초록',   value: '#16a34a' },
  { key: 'blue',    label: '파랑',   value: '#2563eb' },
  { key: 'purple',  label: '보라',   value: '#9333ea' },
  { key: 'pink',    label: '분홍',   value: '#db2777' },
  { key: 'gray',    label: '회색',   value: '#6b7280' },
];

/**
 * 텍스트 색상 팝오버 — Color extension 사용.
 * 검정 텍스트로 자동 복귀하려면 unsetColor.
 */
export function TextColorPalette({
  editor,
  iconSize = 15,
  triggerClassName,
}: TextColorPaletteProps) {
  return (
    <Popover
      align="start"
      trigger={
        <button
          type="button"
          title="글자 색"
          className={cn(
            'h-7 w-7 shrink-0 rounded flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors',
            triggerClassName,
          )}
        >
          <Palette size={iconSize} />
        </button>
      }
    >
      {(close) => (
        <div className="flex flex-col gap-2 p-1">
          <div className="grid grid-cols-3 gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c.key}
                type="button"
                title={c.label}
                onClick={() => {
                  if (c.key === 'default') {
                    (editor.chain().focus() as any).unsetColor().run();
                  } else {
                    (editor.chain().focus() as any).setColor(c.value).run();
                  }
                  close();
                }}
                className="flex h-6 items-center justify-center rounded border border-border px-2 text-[11px] transition-transform hover:scale-105"
                style={
                  c.key === 'default'
                    ? { color: 'var(--foreground)' }
                    : { color: c.value }
                }
              >
                {c.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              (editor.chain().focus() as any).unsetColor().run();
              close();
            }}
            className="flex items-center justify-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Eraser size={12} />
            기본 색
          </button>
        </div>
      )}
    </Popover>
  );
}
