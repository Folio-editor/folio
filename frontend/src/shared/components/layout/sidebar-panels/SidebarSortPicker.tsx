// ============================================================
// SidebarSortPicker — 새 문서 버튼 옆 작은 정렬 버튼 (popover)
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { ArrowDownUp, Check } from 'lucide-react';
import {
  useSortPreferenceStore,
  type SortMode,
  type SortPanelKey,
} from '../../../stores/sortPreferenceStore';
import { cn } from '../../../lib/cn';

const LABELS: Record<SortMode, string> = {
  manual: '기본순',
  recent: '최근 편집순',
  alpha: '가나다 순',
};

const ORDER: SortMode[] = ['manual', 'recent', 'alpha'];

interface Props {
  panelKey: SortPanelKey;
}

export function SidebarSortPicker({ panelKey }: Props) {
  const mode = useSortPreferenceStore((s) => s.byPanel[panelKey] ?? 'manual');
  const setMode = useSortPreferenceStore((s) => s.set);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const isCustom = mode !== 'manual';

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={`정렬: ${LABELS[mode]}`}
        aria-label={`정렬 기준: ${LABELS[mode]}`}
        className={cn(
          'inline-flex items-center justify-center rounded p-1 transition-colors',
          isCustom
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        )}
      >
        <ArrowDownUp size={12} strokeWidth={1.75} />
      </button>

      {open && (
        <div className="absolute right-0 top-6 z-50 min-w-35 rounded-md border border-border bg-popover p-1 shadow-md">
          {ORDER.map((m) => {
            const active = mode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(panelKey, m);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs transition-colors',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-foreground hover:bg-accent',
                )}
              >
                <span className="flex h-3 w-3 shrink-0 items-center justify-center">
                  {active && <Check size={10} strokeWidth={2.5} />}
                </span>
                {LABELS[m]}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
