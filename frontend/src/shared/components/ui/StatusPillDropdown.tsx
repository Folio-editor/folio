import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn';

export type StatusTone = 'slate' | 'amber' | 'blue' | 'emerald' | 'rose' | 'sky';

const TONE_DOT: Record<StatusTone, string> = {
  slate: 'bg-slate-400',
  amber: 'bg-amber-500',
  blue: 'bg-blue-500',
  emerald: 'bg-emerald-500',
  rose: 'bg-rose-500',
  sky: 'bg-sky-500',
};

export interface StatusPillOption {
  value: string;
  label: string;
  tone?: StatusTone;
}

interface StatusPillDropdownProps {
  value: string;
  options: StatusPillOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  /** 트리거 폭 (px). 기본 fit-content 느낌 — 값 미지정 시 자연 폭. */
  width?: number;
  /** 라벨 prefix (예: "중요도 : ") — 기본 prefix 없음 */
  prefix?: string;
}

/**
 * 헤더 같은 overflow 컨테이너 안에서도 잘리지 않도록 portal로 렌더링되는 상태 드롭다운.
 * 트리거 버튼은 색 점(dot)으로 톤 표시, 본체는 semantic 토큰만 사용해 다크모드 호환.
 */
export function StatusPillDropdown({
  value,
  options,
  onChange,
  ariaLabel,
  width,
  prefix,
}: StatusPillDropdownProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const current = options.find((o) => o.value === value) ?? options[0];

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuWidth = Math.max(rect.width, 140);
    setMenuPos({
      top: rect.bottom + 4,
      left: Math.max(8, rect.right - menuWidth),
      width: menuWidth,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const handleScroll = () => setOpen(false);
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        style={width ? { width } : undefined}
        className={cn(
          'flex h-8 items-center justify-between gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors',
          'hover:border-primary/30 hover:bg-muted/50',
          open && 'border-primary/40 bg-muted/40',
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {current?.tone && (
            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', TONE_DOT[current.tone])} />
          )}
          <span className="truncate">
            {prefix}
            {current?.label ?? value}
          </span>
        </span>
        <ChevronDown
          size={13}
          strokeWidth={1.8}
          className={cn(
            'shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && menuPos &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label={ariaLabel}
            style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
            className="fixed z-50 overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg"
          >
            {options.map((option) => {
              const selected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-xs transition-colors',
                    'hover:bg-muted focus:bg-muted focus:outline-none',
                    selected && 'bg-muted/60 font-medium',
                  )}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    {option.tone && (
                      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', TONE_DOT[option.tone])} />
                    )}
                    <span className="truncate">{option.label}</span>
                  </span>
                  {selected && (
                    <Check size={12} strokeWidth={2} className="shrink-0 text-muted-foreground" />
                  )}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
