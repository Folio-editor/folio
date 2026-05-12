import { useEffect, useState } from 'react';
import { cn } from '../../lib/cn';
import { useDraggableRect } from '../../hooks/useDraggableRect';
import {
  FONT_SERIF,
  FONT_MONO,
  MODAL_SHADOW,
  FADE_ANIMATION,
} from '../../constants/folioModalTokens';

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

const PERSIST_KEY = 'folio.editorShortcutHelp.rect.v1';
const DEFAULT_W = 440;
const DEFAULT_H = 520;
const MIN_W = 380;
const MIN_H = 360;

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
    <kbd
      className="inline-flex h-[20px] items-center rounded-[3px] border border-border border-b-[1.5px] bg-card px-1.5 text-[10.5px] text-popover-foreground"
      style={{ fontFamily: FONT_MONO }}
    >
      {children}
    </kbd>
  );
}

export default function EditorShortcutHelp({
  open,
  onClose,
}: EditorShortcutHelpProps) {
  const [tab, setTab] = useState<'shortcut' | 'markdown'>('shortcut');
  const drag = useDraggableRect({
    active: open,
    initialWidth: DEFAULT_W,
    initialHeight: DEFAULT_H,
    minWidth: MIN_W,
    minHeight: MIN_H,
    persistKey: PERSIST_KEY,
  });

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === '1') {
        e.preventDefault();
        setTab('shortcut');
      } else if (e.key === '2') {
        e.preventDefault();
        setTab('markdown');
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open || !drag.rect) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="folio-esh-title"
      data-folio-dialog
      className="fixed z-50 flex flex-col rounded-[12px] border border-border bg-popover text-popover-foreground overflow-hidden"
      style={{
        left: drag.rect.x,
        top: drag.rect.y,
        width: drag.rect.w,
        height: drag.rect.h,
        boxShadow: MODAL_SHADOW,
        animation: FADE_ANIMATION,
      }}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerUp}
    >
      <style>{`
        @keyframes folioDialogFade {
          from { opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-folio-dialog] { animation: none !important; }
        }
      `}</style>

      {/* Header — 드래그 영역 */}
      <div
        className="flex items-start justify-between gap-3 px-7 pt-6 pb-3 cursor-move select-none flex-shrink-0"
        onPointerDown={drag.startMove}
      >
        <div className="flex-1 min-w-0">
          <div aria-hidden className="mb-2 h-px w-7 bg-foreground opacity-45" />
          <div className="mb-1 text-[10.5px] tracking-[0.32em] uppercase text-muted-foreground">
            Editor · Help
          </div>
          <h2
            id="folio-esh-title"
            className="m-0 text-[18px] font-semibold leading-[1.35] tracking-[-0.015em] text-popover-foreground"
            style={{ fontFamily: FONT_SERIF }}
          >
            편집 도움말
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label="닫기"
          className="ml-1 mt-1 px-1.5 py-1 text-[11px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-popover-foreground"
        >
          닫기 ✕
        </button>
      </div>

      {/* Tabs */}
      <nav
        role="tablist"
        aria-label="도움말 분류"
        className="flex items-center gap-[18px] border-b border-border/60 px-7 shrink-0"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'shortcut'}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setTab('shortcut')}
          className={cn(
            'relative bg-transparent border-0 cursor-pointer px-0 pb-2 pt-1.5 text-[13px] font-medium transition-colors',
            tab === 'shortcut'
              ? 'text-popover-foreground after:absolute after:-bottom-px after:left-0 after:right-0 after:h-[1.5px] after:bg-foreground'
              : 'text-muted-foreground hover:text-popover-foreground',
          )}
        >
          단축키
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'markdown'}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setTab('markdown')}
          className={cn(
            'relative bg-transparent border-0 cursor-pointer px-0 pb-2 pt-1.5 text-[13px] font-medium transition-colors',
            tab === 'markdown'
              ? 'text-popover-foreground after:absolute after:-bottom-px after:left-0 after:right-0 after:h-[1.5px] after:bg-foreground'
              : 'text-muted-foreground hover:text-popover-foreground',
          )}
        >
          마크다운
        </button>
        <span className="ml-auto pb-2 pt-1.5 text-[11px] text-muted-foreground">
          Esc 로 닫기
        </span>
      </nav>

      {/* Content */}
      <div
        className="flex-1 overflow-y-auto px-7 pt-3 pb-3"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {tab === 'shortcut' &&
          categories.map((category) => (
            <div key={category.title} className="mb-4 last:mb-0">
              <h3 className="m-0 mb-1.5 flex items-center gap-2.5 text-[10.5px] font-medium uppercase tracking-[0.28em] text-muted-foreground">
                {category.title}
                <span aria-hidden className="flex-1 h-px bg-border/70" />
              </h3>
              <div>
                {category.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.keys}
                    className="flex items-center justify-between gap-3 py-1"
                  >
                    <span className="text-[12.5px] leading-[1.5] text-popover-foreground">
                      {shortcut.label}
                    </span>
                    <span className="inline-flex gap-1">
                      {shortcut.keys.split('+').map((key, i) => (
                        <Kbd key={i}>{key}</Kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}

        {tab === 'markdown' && (
          <div>
            <p
              className="m-0 mb-2.5 pb-2.5 border-b border-dashed border-border/60 text-[12.5px] italic leading-[1.6] text-muted-foreground"
              style={{ fontFamily: FONT_SERIF }}
            >
              줄 시작에 입력하면 자동으로 서식이 적용됩니다.
            </p>
            <div>
              {markdownEntries.map((entry) => (
                <div
                  key={entry.syntax}
                  className="flex items-center justify-between gap-3 py-1"
                >
                  <span className="text-[12.5px] leading-[1.5] text-popover-foreground">
                    {entry.label}
                  </span>
                  <code
                    className="rounded-[3px] border border-border bg-card px-2 py-0.5 text-[11px] text-popover-foreground"
                    style={{
                      fontFamily:
                        'ui-monospace, SFMono-Regular, Menlo, monospace',
                    }}
                  >
                    {entry.syntax}
                  </code>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-7 py-3 border-t border-border/60 text-center text-[11px] text-muted-foreground shrink-0">
        <Kbd>Esc</Kbd> 닫기 · <Kbd>1</Kbd> 단축키 · <Kbd>2</Kbd> 마크다운
      </div>

      {/* Resize grip */}
      <div
        role="separator"
        aria-label="크기 조절"
        onPointerDown={drag.startResize}
        className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
        style={{
          background:
            'linear-gradient(135deg, transparent 50%, var(--muted-foreground) 50%, var(--muted-foreground) 60%, transparent 60%, transparent 70%, var(--muted-foreground) 70%, var(--muted-foreground) 80%, transparent 80%)',
          opacity: 0.4,
        }}
      />
    </div>
  );
}
