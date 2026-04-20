import type { ReactNode } from 'react';

interface MainPanelHeaderProps {
  /** 좌측: 뒤로 버튼 등 네비게이션 */
  leading?: ReactNode;
  /** 중앙: 제목 (flex-1) */
  title: ReactNode;
  /** 제목 옆 한줄 설명 (작고 연한 텍스트) */
  subtitle?: string;
  /** 우측: 상태 뱃지, 셀렉트, 액션 버튼 등 */
  trailing?: ReactNode;
  /** 헤더 아래 추가 행 (메타 필드 등) — 선택적 */
  meta?: ReactNode;
}

/**
 * 모든 메인 패널에서 공통으로 사용하는 통일 헤더.
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │ [leading]  Title  subtitle(연한)              [trailing]    │  h-12 px-6
 * ├─────────────────────────────────────────────────────────────┤
 * │ meta (선택적)                                               │  px-6 py-2
 * └─────────────────────────────────────────────────────────────┘
 */
export function MainPanelHeader({ leading, title, subtitle, trailing, meta }: MainPanelHeaderProps) {
  return (
    <div className="shrink-0">
      {/* 메인 행 */}
      <div className="flex h-12 items-center gap-3 border-b border-border px-6">
        {leading}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className={subtitle ? 'shrink-0' : 'min-w-0 flex-1'}>{title}</div>
          {subtitle && (
            <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
          )}
        </div>
        {trailing && <div className="flex shrink-0 items-center gap-2">{trailing}</div>}
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
