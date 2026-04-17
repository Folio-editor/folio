import { useEffect } from 'react';
import { X } from 'lucide-react';

interface EditorShortcutHelpProps {
  open: boolean;
  onClose: () => void;
}

interface ShortcutEntry {
  keys: string;
  label: string;
}

interface ShortcutCategory {
  title: string;
  shortcuts: ShortcutEntry[];
}

const categories: ShortcutCategory[] = [
  {
    title: '텍스트 서식',
    shortcuts: [
      { keys: 'Ctrl+B', label: '굵게' },
      { keys: 'Ctrl+I', label: '기울임' },
      { keys: 'Ctrl+U', label: '밑줄' },
      { keys: 'Ctrl+Shift+X', label: '취소선' },
      { keys: 'Ctrl+Shift+H', label: '형광펜' },
    ],
  },
  {
    title: '편집',
    shortcuts: [
      { keys: 'Ctrl+Z', label: '되돌리기' },
      { keys: 'Ctrl+Shift+Z', label: '다시 실행' },
      { keys: 'Ctrl+Shift+M', label: '작가 메모' },
    ],
  },
  {
    title: '탐색',
    shortcuts: [
      { keys: 'Ctrl+F', label: '찾기' },
      { keys: 'Ctrl+H', label: '바꾸기' },
    ],
  },
  {
    title: '집필 모드',
    shortcuts: [{ keys: 'Ctrl+Shift+F', label: '집중 모드 토글' }],
  },
];

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex h-5 items-center rounded border border-border bg-muted px-1.5 text-[11px] font-mono text-muted-foreground">
      {children}
    </kbd>
  );
}

export default function EditorShortcutHelp({
  open,
  onClose,
}: EditorShortcutHelpProps) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="relative w-full max-w-lg rounded-lg bg-popover p-6 shadow-lg border border-border">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">단축키 안내</h2>
          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Categories */}
        <div className="space-y-4">
          {categories.map((category) => (
            <div key={category.title}>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {category.title}
              </h3>
              <div className="space-y-1">
                {category.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.keys}
                    className="flex items-center justify-between py-1"
                  >
                    <span className="text-sm">{shortcut.label}</span>
                    <div className="flex gap-1">
                      {shortcut.keys.split('+').map((key, i) => (
                        <Kbd key={i}>{key}</Kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
