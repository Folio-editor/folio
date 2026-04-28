// ============================================================
// SidebarFilterPicker — 사이드바 검색창 옆 다중 필터 popover
// ============================================================
// 클릭 시 옵션 체크박스 popover. 활성 필터 있으면 dot 표시.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { Filter, Check } from 'lucide-react';
import {
  useFilterPreferenceStore,
  EMPTY_FILTER,
} from '../../../stores/filterPreferenceStore';
import type { SortPanelKey } from '../../../stores/sortPreferenceStore';
import { cn } from '../../../lib/cn';

export interface FilterOption {
  value: string;
  label: string;
}

interface Props {
  panelKey: SortPanelKey;
  options: FilterOption[];
  /** 사용자에게 보여줄 필터 그룹 이름 (예: "상태", "태그") */
  groupLabel?: string;
  emptyMessage?: string;
}

export function SidebarFilterPicker({
  panelKey,
  options,
  groupLabel,
  emptyMessage = '선택할 필터가 없습니다.',
}: Props) {
  const selected = useFilterPreferenceStore(
    (s) => s.byPanel[panelKey] ?? (EMPTY_FILTER as string[]),
  );
  const toggle = useFilterPreferenceStore((s) => s.toggle);
  const clear = useFilterPreferenceStore((s) => s.clear);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 → 닫기
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

  const hasActive = selected.length > 0;

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={hasActive ? `${groupLabel ?? '필터'}: ${selected.length}개 활성` : '필터'}
        aria-label="필터"
        className={cn(
          'relative inline-flex items-center justify-center rounded p-1 transition-colors',
          hasActive
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        )}
      >
        <Filter size={12} strokeWidth={1.75} />
        {hasActive && (
          <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-6 z-50 min-w-35 rounded-md border border-border bg-popover p-1 shadow-md">
          {groupLabel && (
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {groupLabel}
            </div>
          )}
          {options.length === 0 && (
            <div className="px-2 py-2 text-xs text-muted-foreground">
              {emptyMessage}
            </div>
          )}
          {options.map((opt) => {
            const active = selected.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggle(panelKey, opt.value)}
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
                {opt.label}
              </button>
            );
          })}
          {hasActive && (
            <>
              <div className="my-1 border-t border-border" />
              <button
                type="button"
                onClick={() => clear(panelKey)}
                className="w-full rounded px-2 py-1 text-left text-[10px] text-muted-foreground hover:bg-accent"
              >
                필터 초기화
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
