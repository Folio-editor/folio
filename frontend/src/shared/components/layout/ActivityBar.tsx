import type { LucideIcon } from 'lucide-react';
import {
  BookOpenText,
  ClipboardList,
  Route,
  Globe,
  Home,
  KeyRound,
  Lightbulb,
  Settings,
  Trash2,
  Users,
} from 'lucide-react';
import {
  Activity,
  ACTIVITY_LABELS,
  ACTIVITY_ORDER_MAIN,
  ACTIVITY_ORDER_BOTTOM,
} from '../../types/workspace';
import { cn } from '../../lib/cn';

interface ActivityBarProps {
  activity: Activity;
  onActivityChange: (next: Activity) => void;
  workSelected: boolean;
  settingsMode: boolean;
  onSettingsClick: () => void;
}

const ACTIVITY_ICONS: Record<Activity, LucideIcon> = {
  home: Home,
  plan: ClipboardList,
  'world-note': Globe,
  character: Users,
  plot: Route,
  episode: BookOpenText,
  foreshadow: KeyRound,
  'idea-archive': Lightbulb,
  trash: Trash2,
};

/**
 * VSCode 스타일 좁은 좌측 액티비티 바.
 * - 상단: home + 워크스페이스 섹션
 * - 하단: 휴지통 + 설정 (spacer로 밀어냄)
 * - home / trash 는 항상 활성
 * - 섹션 아이콘은 workSelected=false 일 때 disabled
 * - 선택된 항목은 좌측 2px 인디케이터 + 진한 색상
 */
export function ActivityBar({ activity, onActivityChange, workSelected, settingsMode, onSettingsClick }: ActivityBarProps) {
  const renderButton = (item: Activity) => {
    const Icon = ACTIVITY_ICONS[item];
    const isActive = activity === item && !settingsMode;
    const alwaysEnabled = item === 'home' || item === 'trash';
    const isDisabled = !alwaysEnabled && !workSelected;
    const label = ACTIVITY_LABELS[item];

    return (
      <button
        key={item}
        type="button"
        onClick={() => onActivityChange(item)}
        disabled={isDisabled}
        title={isDisabled ? '작품을 먼저 선택하세요' : label}
        aria-label={label}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'relative flex h-11 w-11 items-center justify-center rounded-md transition-colors',
          isActive && !isDisabled
            ? 'text-activity-bar-foreground'
            : 'text-muted-foreground hover:bg-activity-bar-accent hover:text-activity-bar-foreground',
          isDisabled && 'cursor-not-allowed opacity-40 hover:bg-transparent',
        )}
      >
        {isActive && !isDisabled && (
          <span
            aria-hidden
            className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r bg-primary"
          />
        )}
        <Icon size={20} strokeWidth={1.75} />
      </button>
    );
  };

  return (
    <nav
      className="flex w-14 shrink-0 flex-col items-center justify-between border-r border-activity-bar-border bg-activity-bar py-2"
      aria-label="액티비티 바"
    >
      {/* 상단: 메인 액티비티 */}
      {ACTIVITY_ORDER_MAIN.map(renderButton)}

      {/* 스페이서 — 하단 아이콘을 바닥으로 밀어냄 */}
      <div className="flex-1" />

      {/* 하단: 휴지통 + 설정 */}
      <div className="flex flex-col items-center pb-1">
        {ACTIVITY_ORDER_BOTTOM.map(renderButton)}
        <button
          type="button"
          onClick={onSettingsClick}
          aria-label="설정"
          title="설정"
          className={cn(
            'relative flex h-11 w-11 items-center justify-center rounded-md transition-colors',
            settingsMode
              ? 'text-activity-bar-foreground'
              : 'text-muted-foreground hover:bg-activity-bar-accent hover:text-activity-bar-foreground',
          )}
        >
          {settingsMode && (
            <span
              aria-hidden
              className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r bg-primary"
            />
          )}
          <Settings size={20} strokeWidth={1.75} />
        </button>
      </div>
    </nav>
  );
}
