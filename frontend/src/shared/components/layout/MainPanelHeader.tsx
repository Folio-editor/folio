import type { ReactNode } from 'react';
import { ArrowUpRight, PanelRight, X } from 'lucide-react';
import { useRightPanelToggle } from './AppShell';
import { cn } from '../../lib/cn';

interface MainPanelHeaderProps {
  /** 좌측: 뒤로 버튼 등 네비게이션 (legacy — 가능하면 onClose 사용) */
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
   * 메인 패널 ✕ — 현 문서를 프리뷰 슬롯으로 강등 후 메인 비움.
   * 제공되지 않으면 ✕ 버튼 미렌더 (Settings 등에선 사용 안 함).
   */
  onClose?: () => void;
  /**
   * 메인 패널 ↗ — 현 문서를 우측 핀 상단으로 옮기고 메인 비움.
   * 제공되지 않으면 ↗ 버튼 미렌더.
   */
  onSendToRight?: () => void;
}

/**
 * 모든 메인 패널에서 공통으로 사용하는 통일 헤더.
 *
 * ┌───────────────────────────────────────────────────────────────────┐
 * │ [leading]  Title  subtitle(연한)    [trailing]  [우측패널토글]    │  h-12 px-6
 * ├───────────────────────────────────────────────────────────────────┤
 * │ meta (선택적)                                                     │  px-6 py-2
 * └───────────────────────────────────────────────────────────────────┘
 *
 * 우측 패널 토글 버튼은 Context를 통해 자동 렌더되며 항상 제일 우측에 위치한다.
 */
export function MainPanelHeader({
  leading,
  title,
  subtitle,
  trailing,
  meta,
  onClose,
  onSendToRight,
}: MainPanelHeaderProps) {
  const rightPanel = useRightPanelToggle();

  return (
    <div className="shrink-0">
      {/* 메인 행 — 좁은 메인 영역에서 우측 패널로 시각 침범 방지 + 모든 버튼 접근 가능하도록 가로 스크롤. */}
      <div className="flex h-12 items-center gap-3 overflow-x-auto scrollbar-none border-b border-border px-6">
        {leading}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className={subtitle ? 'shrink-0' : 'min-w-0 flex-1'}>{title}</div>
          {subtitle && (
            <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
          )}
        </div>
        {trailing && <div className="flex shrink-0 items-center gap-2">{trailing}</div>}

        {/* ↗ 우측으로 보내기 — 현 문서를 핀 상단으로, 메인 비움 */}
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

        {/* ✕ 닫기 — 현 문서를 프리뷰로 강등, 메인 비움 */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            title="닫기 (메인 비우기)"
            aria-label="메인 패널 닫기"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X size={15} strokeWidth={1.75} />
          </button>
        )}

        {/* 우측 패널 토글 — 항상 제일 우측 고정 */}
        {rightPanel && (
          <button
            type="button"
            onClick={rightPanel.toggle}
            title={`보조 패널 ${rightPanel.visible ? '닫기' : '열기'} (Ctrl+Shift+B)`}
            aria-label="보조 패널 토글"
            className={cn(
              'ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors',
              rightPanel.visible
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <PanelRight size={15} strokeWidth={1.75} />
          </button>
        )}
      </div>

      {/* 메타 행 (선택적) */}
      {meta && (
        <div className="border-b border-border/50 bg-muted/30 px-6 py-2">
          {meta}
        </div>
      )}
    </div>
  );
}
