import { useEffect, useState } from 'react';
import {
  Minus,
  Square,
  Copy,
  X,
  Download,
  RefreshCw,
  RotateCw,
  AlertCircle,
  CloudOff,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { useUpdater } from '../../hooks/useUpdater';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useNavigationStore } from '../../stores/navigationStore';

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

      {/* 우측 — 업데이트 빠른 진입 + OS 창 컨트롤 */}
      <div
        className="flex h-full items-center"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <UpdateQuickButton />

        {/* OS 창 컨트롤 — macOS는 OS traffic light가 좌측에 있으므로 숨김 */}
        {!isMac && (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}

/**
 * 타이틀바 우측 업데이트 빠른 진입 버튼.
 *
 * UI 원칙:
 *  - 액션 가능한 상태일 때만 "활성"(채도 ON, 호버 가능, 클릭 가능).
 *  - 그 외(최신 / 오프라인 / 확인 중 / 다운로드 중 / 미지원)는 "비활성"
 *    — 채도 낮추고 cursor-not-allowed, 호버 효과 없음, 툴팁만 안내.
 *  - 마운트 시 1회 자동 check() — 사용자 클릭 없이도 새 버전 존재를 인지하도록.
 *  - 온라인 복귀 시에도 자동 재확인.
 *
 * 액션 가능한 상태:
 *  - available  → 다운로드 시작
 *  - downloaded → 설정의 "앱 정보" 이동 (거기서 재시작 확인)
 *  - error      → 설정의 "앱 정보" 이동 (에러 상세)
 *
 * unsupported(웹/dev) 또는 isWeb: 렌더 안 함.
 */
function UpdateQuickButton() {
  const { state, isWeb, check, download } = useUpdater();
  const isOnline = useNetworkStatus();
  const openSettings = useNavigationStore((s) => s.openSettings);

  // 마운트 시 / 온라인 복귀 시 1회 자동 확인.
  // 이미 check 결과가 있는 상태(available / not-available / downloaded / downloading / error)에선 재시도 안 함.
  useEffect(() => {
    if (isWeb) return;
    if (!isOnline) return;
    if (state.phase !== 'idle') return;
    void check();
  }, [isWeb, isOnline, state.phase, check]);

  if (isWeb) return null;
  if (state.phase === 'unsupported') return null;

  const phase = state.phase;
  const percent = state.progress?.percent ?? 0;

  // 오프라인 가드 — 최우선
  if (!isOnline) {
    return (
      <DisabledButton
        icon={<CloudOff size={13} strokeWidth={1.75} />}
        label="오프라인 — 네트워크 연결 시 업데이트를 확인합니다"
      />
    );
  }

  // phase별 분기 — 액션 가능한 상태만 enabled
  switch (phase) {
    case 'available':
      return (
        <EnabledButton
          icon={<Download size={13} strokeWidth={1.75} />}
          label={`새 버전 ${state.version ?? ''} 사용 가능 — 클릭하여 다운로드`}
          dotClass="bg-info"
          onClick={() => void download()}
        />
      );
    case 'downloaded':
      return (
        <EnabledButton
          icon={<RotateCw size={13} strokeWidth={1.75} />}
          label={`Folio ${state.version ?? ''} 설치 준비 완료 — 클릭`}
          dotClass="bg-success"
          onClick={() => openSettings('about')}
        />
      );
    case 'error':
      return (
        <EnabledButton
          icon={<AlertCircle size={13} strokeWidth={1.75} />}
          label="업데이트 오류 — 클릭하여 자세히 보기"
          dotClass="bg-danger"
          onClick={() => openSettings('about')}
        />
      );
    case 'checking':
      return (
        <DisabledButton
          icon={<RefreshCw size={13} strokeWidth={1.75} className="animate-spin" />}
          label="업데이트 확인 중…"
        />
      );
    case 'downloading':
      return (
        <DisabledButton
          icon={<RefreshCw size={13} strokeWidth={1.75} className="animate-spin" />}
          label={`다운로드 중 ${percent.toFixed(0)}%`}
        />
      );
    case 'not-available':
    case 'idle':
    default:
      // 최신 버전 — 잠금 + 채도 낮춤
      return (
        <DisabledButton
          icon={<RefreshCw size={13} strokeWidth={1.75} />}
          label="최신 버전입니다"
        />
      );
  }
}

function EnabledButton({
  icon,
  label,
  dotClass,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  dotClass?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="relative flex h-8 w-9 items-center justify-center text-activity-bar-foreground transition-colors hover:bg-activity-bar-accent"
    >
      {icon}
      {dotClass && (
        <span
          className={cn(
            'absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full ring-1 ring-activity-bar',
            dotClass,
          )}
        />
      )}
    </button>
  );
}

function DisabledButton({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      aria-label={label}
      title={label}
      className="flex h-8 w-9 cursor-not-allowed items-center justify-center text-activity-bar-foreground/35"
    >
      {icon}
    </button>
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
