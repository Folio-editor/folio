import type { Editor } from '@tiptap/react';
import { Eraser, Highlighter } from 'lucide-react';
import { Popover } from '../ui/Popover';
import { cn } from '../../lib/cn';

interface HighlightColorPaletteProps {
  editor: Editor;
  iconSize?: number;
  /** 트리거 버튼 크기 클래스 (h-7 w-7 등) */
  triggerClassName?: string;
}

interface Swatch {
  key: string;
  label: string;
  cssVar: string;
}

const SWATCHES: Swatch[] = [
  { key: 'yellow', label: '노랑',  cssVar: 'var(--editor-mark-yellow)' },
  { key: 'green',  label: '초록',  cssVar: 'var(--editor-mark-green)' },
  { key: 'blue',   label: '파랑',  cssVar: 'var(--editor-mark-blue)' },
  { key: 'pink',   label: '분홍',  cssVar: 'var(--editor-mark-pink)' },
  { key: 'purple', label: '보라',  cssVar: 'var(--editor-mark-purple)' },
  { key: 'orange', label: '주황',  cssVar: 'var(--editor-mark-orange)' },
  { key: 'red',    label: '빨강',  cssVar: 'var(--editor-mark-red)' },
  { key: 'gray',   label: '회색',  cssVar: 'var(--editor-mark-gray)' },
];

/**
 * 형광펜 팝오버 — 8색 파스텔 팔레트 + 지우기.
 * Highlight 확장 multicolor 모드에서 data-color 속성으로 적용.
 */
export function HighlightColorPalette({
  editor,
  iconSize = 15,
  triggerClassName,
}: HighlightColorPaletteProps) {
  const active = editor.isActive('highlight');

  return (
    <Popover
      align="start"
      trigger={
        <button
          type="button"
          title="형광펜"
          className={cn(
            'h-7 w-7 shrink-0 rounded flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors',
            active && 'bg-accent text-accent-foreground',
            triggerClassName,
          )}
        >
          <Highlighter size={iconSize} />
        </button>
      }
    >
      {(close) => (
        <div className="flex flex-col gap-2 p-1">
          <div className="grid grid-cols-4 gap-1.5">
            {SWATCHES.map((s) => (
              <button
                key={s.key}
                type="button"
                title={s.label}
                onClick={() => {
                  (editor.chain().focus() as any)
                    .setHighlight({ color: s.key })
                    .run();
                  close();
                }}
                className="h-6 w-6 rounded border border-border transition-transform hover:scale-110"
                style={{ background: s.cssVar }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              (editor.chain().focus() as any).unsetHighlight().run();
              close();
            }}
            className="flex items-center justify-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Eraser size={12} />
            지우기
          </button>
        </div>
      )}
    </Popover>
  );
}
