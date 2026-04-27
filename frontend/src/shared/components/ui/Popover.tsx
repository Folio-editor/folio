import {
  cloneElement,
  isValidElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';

interface PopoverProps {
  /** 팝오버를 열고 닫는 트리거 — onClick이 자동 부착됨 */
  trigger: ReactElement<{ onClick?: (e: React.MouseEvent) => void }>;
  /** 팝오버 내부 콘텐츠 — close 콜백 받음 */
  children: ((close: () => void) => ReactNode) | ReactNode;
  /** 트리거 기준 정렬: start | end (default end — 우상단 정렬) */
  align?: 'start' | 'end';
  /** 팝오버 너비 — 미지정 시 fit-content */
  width?: number;
  className?: string;
}

/**
 * 트리거 + 포털 팝오버.
 * - 외부 클릭 / Esc / 스크롤 시 자동 닫힘
 * - 트리거 위치 기반으로 화면에 고정 (헤더 overflow 안에서도 잘리지 않음)
 * - 단순한 inline 인라인 팝업이 필요할 때 재사용 (하이라이트 팔레트, 도움말 등)
 */
export function Popover({
  trigger,
  children,
  align = 'end',
  width,
  className,
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; minWidth: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const w = width ?? rect.width;
    const left = align === 'end' ? Math.max(8, rect.right - w) : rect.left;
    setPos({ top: rect.bottom + 4, left, minWidth: w });
  }, [open, align, width]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  const close = () => setOpen(false);

  // trigger에 ref + onClick 부착
  const triggerNode = isValidElement(trigger)
    ? cloneElement(trigger, {
        ref: (node: HTMLElement | null) => {
          triggerRef.current = node;
          // 원래 ref도 유지
          const originalRef = (trigger as { ref?: unknown }).ref;
          if (typeof originalRef === 'function') {
            (originalRef as (n: HTMLElement | null) => void)(node);
          } else if (originalRef && typeof originalRef === 'object') {
            (originalRef as { current: HTMLElement | null }).current = node;
          }
        },
        onClick: (e: React.MouseEvent) => {
          trigger.props.onClick?.(e);
          if (!e.defaultPrevented) setOpen((v) => !v);
        },
      } as Record<string, unknown>)
    : trigger;

  return (
    <>
      {triggerNode}
      {open && pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{ top: pos.top, left: pos.left, minWidth: pos.minWidth }}
            className={cn(
              'fixed z-50 rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-lg',
              className,
            )}
          >
            {typeof children === 'function' ? children(close) : children}
          </div>,
          document.body,
        )}
    </>
  );
}
