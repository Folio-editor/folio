import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';

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
      { keys: 'Ctrl+Shift+M', label: '주석' },
      { keys: 'Tab', label: '들여쓰기 / 따옴표·괄호 탈출' },
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

interface MarkdownEntry {
  syntax: string;
  label: string;
}

const markdownEntries: MarkdownEntry[] = [
  { syntax: '# 제목', label: '제목 1' },
  { syntax: '## 제목', label: '제목 2' },
  { syntax: '### 제목', label: '제목 3' },
  { syntax: '- 항목', label: '글머리 기호' },
  { syntax: '1. 항목', label: '번호 매기기' },
  { syntax: '> 인용', label: '인용문' },
  { syntax: '**굵게**', label: '굵게' },
  { syntax: '*기울임*', label: '기울임' },
  { syntax: '`코드`', label: '인라인 코드' },
  { syntax: '---', label: '구분선' },
  { syntax: '*** ', label: '장면 전환' },
  { syntax: '[링크](url)', label: '링크' },
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
  const [tab, setTab] = useState<'shortcut' | 'markdown'>('shortcut');

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
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">편집 도움말</h2>
          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="mb-4 flex gap-1 rounded-md border border-border p-0.5">
          <button
            type="button"
            onClick={() => setTab('shortcut')}
            className={cn(
              'flex-1 rounded px-3 py-1 text-sm transition-colors',
              tab === 'shortcut'
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/50',
            )}
          >
            단축키
          </button>
          <button
            type="button"
            onClick={() => setTab('markdown')}
            className={cn(
              'flex-1 rounded px-3 py-1 text-sm transition-colors',
              tab === 'markdown'
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/50',
            )}
          >
            마크다운
          </button>
        </div>

        {/* Content */}
        <div className="max-h-96 space-y-4 overflow-y-auto">
          {tab === 'shortcut' &&
            categories.map((category) => (
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

          {tab === 'markdown' && (
            <div>
              <p className="mb-3 text-xs text-muted-foreground">
                줄 시작에 입력하면 자동으로 서식이 적용됩니다.
              </p>
              <div className="space-y-1">
                {markdownEntries.map((entry) => (
                  <div
                    key={entry.syntax}
                    className="flex items-center justify-between py-1"
                  >
                    <span className="text-sm">{entry.label}</span>
                    <code className="rounded border border-border bg-muted px-2 py-0.5 text-[11px] font-mono text-muted-foreground">
                      {entry.syntax}
                    </code>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
