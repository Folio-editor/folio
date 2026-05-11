import { useRef, type ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { useHorizontalWheelScroll } from '../../hooks/useHorizontalWheelScroll';

interface MainPanelHeaderProps {
  /** 좌측: 뒤로 버튼 등 네비게이션 (legacy) */
  leading?: ReactNode;
  /** 중앙: 제목 (flex-1) */
  title: ReactNode;
  /** 제목 옆 한줄 설명 (작고 연한 텍스트) */
  subtitle?: string;
  /** 우측: 상태 뱃지, 셀렉트, 액션 버튼 등 */
  trailing?: ReactNode;
  /** 헤더 아래 추가 행 (메타 필드 등) — 선택적 */
  meta?: ReactNode;
  /**
   * (legacy) 메인 ✕ — 현재는 탭바의 × 버튼이 동일 역할이라 헤더에서 표시하지 않음.
   * 호출처 호환성 위해 prop은 유지하되 UI에 렌더되지 않음.
   */
  onClose?: () => void;
  /**
   * 메인 패널 ↗ — 현 문서를 우측 핀 상단으로 옮기고 메인 비움.
   */
  onSendToRight?: () => void;
}

/**
 * 모든 메인 패널에서 공통으로 사용하는 통일 헤더.
 *
 * ┌───────────────────────────────────────────────────────────────────┐
 * │ [leading]  Title  subtitle(연한)    [trailing]  [↗]               │  h-10 px-6
 * ├───────────────────────────────────────────────────────────────────┤
 * │ meta (선택적)                                                     │  px-6 py-2
 * └───────────────────────────────────────────────────────────────────┘
 *
 * 우측 패널 토글과 메인 닫기(×)는 MainTabBar로 이동했다.
 */
export function MainPanelHeader({
  leading,
  title,
  subtitle,
  trailing,
  meta,
  onSendToRight,
}: MainPanelHeaderProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  useHorizontalWheelScroll(scrollerRef);
  return (
    <div className="shrink-0">
      <div
        ref={scrollerRef}
        className="flex h-10 items-center gap-3 overflow-x-auto scrollbar-none border-b border-border px-6"
      >
        {leading}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className={subtitle ? 'shrink-0' : 'min-w-0 flex-1'}>{title}</div>
          {subtitle && (
            <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
          )}
        </div>
        {trailing && <div className="flex shrink-0 items-center gap-2">{trailing}</div>}

        {/* ↗ 우측으로 보내기 */}
        {onSendToRight && (
          <button
            type="button"
            onClick={onSendToRight}
            title="우측 패널로 보내기"
            aria-label="우측 패널로 보내기"
            className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowUpRight size={15} strokeWidth={1.75} />
          </button>
        )}
      </div>

      {meta && (
        <div className="border-b border-border/50 bg-muted/30 px-6 py-2">
          {meta}
        </div>
      )}
    </div>
  );
}
