import { useEffect, useState } from 'react';
import { Minus, Square, Copy, X } from 'lucide-react';
import { cn } from '../../lib/cn';

/**
 * 커스텀 타이틀바 — frame: false 환경에서 OS 창 컨트롤을 직접 그린다.
 *
 * - 높이 32px, 색은 ActivityBar와 동일 토큰 패밀리
 * - 좌측: 드래그 영역 (앱 제목 + 향후 메뉴/탭 추가 슬롯)
 * - 우측: Min / Max(또는 Restore) / Close 버튼
 * - macOS는 OS traffic light가 좌측 상단에 떠 있어 컨트롤 부분만 숨기고
 *   드래그 영역은 traffic light 영역(좌측 80px)을 비워둠
 * - Web은 렌더링 안 함
 *
 * CSS:
 * - `-webkit-app-region: drag`  → 빈 영역에서 마우스로 창 이동
 * - `-webkit-app-region: no-drag` → 버튼 영역에서 클릭 가능
 */
export function TitleBar({ title }: { title?: string }) {
  const platform = window.folio?.window.platform ?? 'web';
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (platform === 'web') return;
    void window.folio.window.isMaximized().then(setIsMaximized);
    const off = window.folio.window.onMaximizeChanged(setIsMaximized);
    return off;
  }, [platform]);

  if (platform === 'web') return null;

  const isMac = platform === 'darwin';

  return (
    <div
      className="flex h-8 shrink-0 select-none items-center border-b border-activity-bar-border bg-activity-bar text-activity-bar-foreground"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      onDoubleClick={() => {
        if (!isMac) void window.folio.window.toggleMaximize();
      }}
    >
      {/* 좌측 — macOS는 traffic light 영역(80px) 비움 */}
      <div className={cn('flex flex-1 items-center gap-2 px-3', isMac && 'pl-20')}>
        {title && (
          <span className="truncate text-xs font-medium opacity-80">{title}</span>
        )}
      </div>

      {/* 우측 컨트롤 — macOS는 OS traffic light가 좌측에 있으므로 숨김 */}
      {!isMac && (
        <div
          className="flex h-full items-center"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <ControlButton
            label="최소화"
            onClick={() => void window.folio.window.minimize()}
          >
            <Minus size={14} strokeWidth={1.75} />
          </ControlButton>
          <ControlButton
            label={isMaximized ? '이전 크기로' : '최대화'}
            onClick={() => void window.folio.window.toggleMaximize()}
          >
            {isMaximized ? (
              <Copy size={12} strokeWidth={1.75} className="-scale-x-100" />
            ) : (
              <Square size={12} strokeWidth={1.75} />
            )}
          </ControlButton>
          <ControlButton
            label="닫기"
            onClick={() => void window.folio.window.close()}
            danger
          >
            <X size={14} strokeWidth={1.75} />
          </ControlButton>
        </div>
      )}
    </div>
  );
}

function ControlButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'flex h-8 w-11 items-center justify-center transition-colors',
        danger
          ? 'hover:bg-danger hover:text-danger-foreground'
          : 'hover:bg-activity-bar-accent',
      )}
    >
      {children}
    </button>
  );
}
