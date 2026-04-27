// ============================================================
// BreadcrumbTitle — 메인/스테이지 헤더 제목 정규화 컴포넌트
// ============================================================
// 메인 헤더 형식: "탭이름 > 부모 > ... > 자신"
// 스테이지 헤더 형식: "부모 > ... > 자신" (tab 라벨은 RightPanels 상단에서 별도 표기)
//
// items 배열 첫 항목이 가장 상위(또는 탭이름), 마지막이 활성 문서.
// 마지막 항목만 굵게/foreground, 나머지는 muted.
// ============================================================

import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';

interface BreadcrumbTitleProps {
  items: (string | null | undefined)[];
  className?: string;
  /** 마지막 항목이 input(편집 가능)이면 children으로 직접 전달 가능 */
  trailing?: React.ReactNode;
}

export function BreadcrumbTitle({
  items,
  className,
  trailing,
}: BreadcrumbTitleProps) {
  const filtered = items
    .map((s) => (s ?? '').trim())
    .filter((s): s is string => s.length > 0);
  const last = trailing ? null : filtered[filtered.length - 1];
  const ancestors = trailing ? filtered : filtered.slice(0, -1);

  return (
    <span
      className={cn(
        'flex min-w-0 items-center gap-1 truncate whitespace-nowrap text-sm',
        className,
      )}
    >
      {ancestors.map((part, i) => (
        <span key={i} className="flex shrink-0 items-center gap-1">
          {i > 0 && (
            <ChevronRight
              size={11}
              strokeWidth={2}
              className="shrink-0 text-muted-foreground/60"
            />
          )}
          <span className="truncate text-muted-foreground">{part}</span>
        </span>
      ))}
      {(last !== null || trailing) && (
        <>
          {ancestors.length > 0 && (
            <ChevronRight
              size={11}
              strokeWidth={2}
              className="shrink-0 text-muted-foreground/60"
            />
          )}
          {trailing ?? (
            <span className="min-w-0 truncate font-semibold text-foreground">
              {last}
            </span>
          )}
        </>
      )}
    </span>
  );
}
