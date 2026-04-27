import type { Editor } from '@tiptap/react';
import { ChevronDown, Type } from 'lucide-react';
import { Popover } from '../ui/Popover';
import { cn } from '../../lib/cn';

interface FontFamilyDropdownProps {
  editor: Editor;
  triggerClassName?: string;
}

interface FontOption {
  key: string;
  label: string;
  value: string;
  preview: string;
}

const FONTS: FontOption[] = [
  { key: 'default', label: '기본',           value: '',                                     preview: 'inherit' },
  { key: 'sans',    label: 'Pretendard',     value: "'Pretendard', 'Noto Sans KR', sans-serif", preview: "'Pretendard', sans-serif" },
  { key: 'serif',   label: '명조 (바탕)',     value: "'Batang', 'Noto Serif KR', serif",       preview: "'Batang', serif" },
  { key: 'mono',    label: '고정폭',          value: "'JetBrains Mono', 'D2Coding', monospace", preview: "'JetBrains Mono', monospace" },
];

/**
 * 부분 선택 텍스트의 폰트 family 변경.
 * TextStyle + FontFamily extension 필요.
 */
export function FontFamilyDropdown({
  editor,
  triggerClassName,
}: FontFamilyDropdownProps) {
  // 현재 선택의 fontFamily attr 추정 (없으면 '기본')
  const currentAttr = (editor.getAttributes('textStyle') as { fontFamily?: string })
    .fontFamily;
  const current = FONTS.find((f) => f.value === currentAttr) ?? FONTS[0];

  return (
    <Popover
      align="start"
      trigger={
        <button
          type="button"
          title="글꼴"
          className={cn(
            'flex h-7 shrink-0 items-center gap-1 rounded px-2 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors',
            triggerClassName,
          )}
        >
          <Type size={13} />
          <span className="max-w-20 truncate">{current.label}</span>
          <ChevronDown size={12} />
        </button>
      }
    >
      {(close) => (
        <div className="flex flex-col gap-0.5 p-1 min-w-36">
          {FONTS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => {
                if (f.key === 'default') {
                  (editor.chain().focus() as any).unsetFontFamily().run();
                } else {
                  (editor.chain().focus() as any).setFontFamily(f.value).run();
                }
                close();
              }}
              className={cn(
                'rounded px-2 py-1 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground',
                current.key === f.key && 'bg-accent text-accent-foreground',
              )}
              style={{ fontFamily: f.preview }}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}
