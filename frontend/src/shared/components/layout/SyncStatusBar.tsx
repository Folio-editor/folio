import { useStatus } from '@powersync/react';
import {
  AlertCircle,
  CheckCircle2,
  CloudOff,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import { useIsGuest } from '../../hooks/useWriterId';
import { cn } from '../../lib/cn';

type BarState = 'active' | 'error' | 'idle' | 'offline';

interface BarView {
  state: BarState;
  label: string;
  Icon: LucideIcon;
}

/**
 * 좌측 하단 프로필 풋터 바로 위에 배치되는 얇은 동기화 상태 바.
 *
 * - PowerSync `useStatus()` 로 실시간 sync 상태 구독
 * - connecting / downloading / uploading → 애니메이션(회전) 활성
 * - idle(synced) → 정적 체크 아이콘
 * - 오류 → 빨간 톤 + 경고 아이콘
 * - 오프라인(연결 끊김) → 구름 아이콘
 * - 게스트 모드: 동기화 없음 → 렌더하지 않음
 */
export function SyncStatusBar() {
  const isGuest = useIsGuest();
  const status = useStatus();

  if (isGuest) return null;

  const {
    connecting,
    connected,
    hasSynced,
    dataFlowStatus: { downloading, uploading, downloadError, uploadError } = {},
  } = status;

  const view = resolveView({
    connecting: connecting ?? false,
    connected: connected ?? false,
    downloading: downloading ?? false,
    uploading: uploading ?? false,
    hasSynced: hasSynced ?? false,
    hasError: Boolean(downloadError || uploadError),
  });

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex h-6 shrink-0 items-center gap-1.5 border-t px-3 text-[11px] transition-colors',
        STATE_STYLES[view.state],
      )}
    >
      <view.Icon
        size={12}
        strokeWidth={2}
        className={cn('shrink-0', view.state === 'active' && 'animate-spin')}
      />
      <span className="truncate">{view.label}</span>
    </div>
  );
}

const STATE_STYLES: Record<BarState, string> = {
  active: 'border-blue-100 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-400',
  idle: 'border-border/50 bg-muted/50 text-muted-foreground',
  error: 'border-red-100 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400',
  offline: 'border-border/50 bg-muted/50 text-muted-foreground/70',
};

function resolveView(args: {
  connecting: boolean;
  connected: boolean;
  downloading: boolean;
  uploading: boolean;
  hasSynced: boolean;
  hasError: boolean;
}): BarView {
  const { connecting, connected, downloading, uploading, hasSynced, hasError } = args;

  if (hasError) {
    return { state: 'error', label: '동기화 오류', Icon: AlertCircle };
  }
  if (connecting) {
    return { state: 'active', label: '연결 중…', Icon: RefreshCw };
  }
  if (downloading && uploading) {
    return { state: 'active', label: '동기화 중…', Icon: RefreshCw };
  }
  if (downloading) {
    return { state: 'active', label: '받는 중…', Icon: RefreshCw };
  }
  if (uploading) {
    return { state: 'active', label: '보내는 중…', Icon: RefreshCw };
  }
  if (!connected) {
    return { state: 'offline', label: '연결 끊김', Icon: CloudOff };
  }
  if (hasSynced) {
    return { state: 'idle', label: '동기화됨', Icon: CheckCircle2 };
  }
  return { state: 'idle', label: '대기 중', Icon: CheckCircle2 };
}
