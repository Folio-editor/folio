import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type Ref,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';

type Side = 'top' | 'right' | 'bottom' | 'left';

export interface TooltipProps {
  /** 툴팁 본문 — string 또는 ReactNode. 빈/falsy 면 렌더 X. */
  content: ReactNode;
  /** trigger element. ref 와 hover/focus 핸들러가 자동 주입된다. */
  children: ReactElement;
  /** 어느 쪽에 띄울지. 화면 끝에 가까우면 자동으로 반대쪽으로 flip. 기본 'top'. */
  side?: Side;
  /** trigger 와 카드 사이 픽셀 간격 (기본 6) */
  offset?: number;
  /** hover 시 표시까지 ms 지연 (기본 250) */
  delayMs?: number;
  /** 툴팁 비활성화 (예: disabled trigger) */
  disabled?: boolean;
}

/**
 * 디자인 시스템에 맞춘 가벼운 툴팁.
 *   - portal 기반 (좁은 사이드바/overflow 컨테이너 안에서도 잘림 없이 표시)
 *   - hover/focus 모두 트리거, blur/leave 즉시 hide
 *   - viewport 가장자리에서 자동 flip (top↔bottom, left↔right)
 *   - 다크모드: bg-popover/text-popover-foreground 토큰 사용
 *   - 브라우저 기본 title 툴팁 회피 — child 의 기존 title 은 그대로 두면 OS 툴팁이 같이 떠 충돌하므로
 *     호출자가 title 을 빼고 Tooltip 으로 감싸야 한다.
 */
export function Tooltip({
  content,
  children,
  side = 'top',
  offset = 6,
  delayMs = 250,
  disabled = false,
}: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pos, setPos] = useState<CSSProperties | null>(null);
  const [resolvedSide, setResolvedSide] = useState<Side>(side);

  const clearShowTimer = () => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  };

  const hide = () => {
    clearShowTimer();
    setOpen(false);
  };

  const scheduleShow = () => {
    if (disabled || !content) return;
    clearShowTimer();
    showTimerRef.current = setTimeout(() => setOpen(true), delayMs);
  };

  // open 상태에서 위치 계산 — viewport flip 포함
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const card = cardRef.current;
    if (!trigger || !card) return;
    const t = trigger.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const margin = 8;

    let actualSide: Side = side;
    // 1차 배치 좌표
    let top = 0;
    let left = 0;
    const place = (s: Side) => {
      switch (s) {
        case 'top':
          top = t.top - c.height - offset;
          left = t.left + t.width / 2 - c.width / 2;
          break;
        case 'bottom':
          top = t.bottom + offset;
          left = t.left + t.width / 2 - c.width / 2;
          break;
        case 'left':
          top = t.top + t.height / 2 - c.height / 2;
          left = t.left - c.width - offset;
          break;
        case 'right':
          top = t.top + t.height / 2 - c.height / 2;
          left = t.right + offset;
          break;
      }
    };
    place(actualSide);

    // viewport 끝 너머로 가면 반대쪽 flip 시도
    if (actualSide === 'top' && top < margin) {
      actualSide = 'bottom';
      place(actualSide);
    } else if (actualSide === 'bottom' && top + c.height > window.innerHeight - margin) {
      actualSide = 'top';
      place(actualSide);
    } else if (actualSide === 'left' && left < margin) {
      actualSide = 'right';
      place(actualSide);
    } else if (actualSide === 'right' && left + c.width > window.innerWidth - margin) {
      actualSide = 'left';
      place(actualSide);
    }

    // 가로/세로 clamp — 화면 안으로 보정
    left = Math.max(margin, Math.min(left, window.innerWidth - c.width - margin));
    top = Math.max(margin, Math.min(top, window.innerHeight - c.height - margin));

    setResolvedSide(actualSide);
    setPos({ top, left, position: 'fixed' });
  }, [open, side, offset, content]);

  // 스크롤/리사이즈 시 즉시 닫기 (재계산보다 깔끔)
  useEffect(() => {
    if (!open) return;
    const onClose = () => hide();
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, [open]);

  useEffect(() => () => clearShowTimer(), []);

  if (!isValidElement(children)) return children;

  // child 에 ref + 이벤트 핸들러 주입. 기존 핸들러는 보존.
  type TriggerProps = {
    ref?: Ref<HTMLElement>;
    onMouseEnter?: (e: React.MouseEvent) => void;
    onMouseLeave?: (e: React.MouseEvent) => void;
    onFocus?: (e: React.FocusEvent) => void;
    onBlur?: (e: React.FocusEvent) => void;
    onClick?: (e: React.MouseEvent) => void;
    'aria-describedby'?: string;
  };
  const triggerProps = children.props as TriggerProps;
  const child = cloneElement(children as ReactElement<TriggerProps>, {
    ref: (node: HTMLElement) => {
      triggerRef.current = node;
      // forwardRef 미지원 child 도 있으니 ref 전달은 best-effort.
      const orig = (children as unknown as { ref?: Ref<HTMLElement> }).ref;
      if (typeof orig === 'function') orig(node);
      else if (orig && typeof orig === 'object') {
        (orig as { current: HTMLElement | null }).current = node;
      }
    },
    onMouseEnter: (e: React.MouseEvent) => {
      triggerProps.onMouseEnter?.(e);
      scheduleShow();
    },
    onMouseLeave: (e: React.MouseEvent) => {
      triggerProps.onMouseLeave?.(e);
      hide();
    },
    onFocus: (e: React.FocusEvent) => {
      triggerProps.onFocus?.(e);
      scheduleShow();
    },
    onBlur: (e: React.FocusEvent) => {
      triggerProps.onBlur?.(e);
      hide();
    },
    onClick: (e: React.MouseEvent) => {
      triggerProps.onClick?.(e);
      hide();
    },
    'aria-describedby': open ? id : triggerProps['aria-describedby'],
  });

  return (
    <>
      {child}
      {open &&
        content &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            ref={cardRef}
            data-side={resolvedSide}
            style={pos ?? { position: 'fixed', opacity: 0 }}
            className={cn(
              'pointer-events-none z-[200] max-w-xs rounded-md border border-border bg-popover px-2 py-1 text-xs leading-snug text-popover-foreground shadow-md',
              'transition-opacity duration-150',
              pos ? 'opacity-100' : 'opacity-0',
            )}
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}
