import type { LucideIcon } from 'lucide-react';
import {
  BookOpenText,
  BotMessageSquare,
  ClipboardCopy,
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
  type RightPanelTab,
} from '../../types/workspace';
import { cn } from '../../lib/cn';

interface ActivityBarProps {
  activity: Activity;
  onActivityChange: (next: Activity) => void;
  workSelected: boolean;
  settingsMode: boolean;
  onSettingsClick: () => void;
  /** 우측 패널 가시 상태 — 퀵 버튼 활성 표시에 사용 */
  rightPanelVisible: boolean;
  /** 우측 패널 현재 활성 탭 — 퀵 버튼 활성 표시에 사용 */
  activeRightTab: RightPanelTab;
  /** 우측 패널을 열고 지정 탭으로 점프 (idea / ai) */
  onRightPanelQuickJump: (tab: RightPanelTab) => void;
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

/** 우측 패널 퀵 점프 버튼 정의 */
const QUICK_JUMP_ITEMS: { tab: 'idea' | 'ai' | 'inbox'; icon: LucideIcon; label: string }[] = [
  { tab: 'idea', icon: Lightbulb, label: '아이디어' },
  { tab: 'ai', icon: BotMessageSquare, label: 'AI 도구' },
  { tab: 'inbox', icon: ClipboardCopy, label: '작업물' },
];

/**
 * VSCode 스타일 좁은 좌측 액티비티 바.
 * - 상단: home + 워크스페이스 섹션 (좌측 사이드바 뷰 전환)
 * - 세퍼레이터로 시각 분리
 * - 우측 패널 퀵 점프: 아이디어 / AI — 좌측 사이드바 영역을 갖지 않고
 *   우측 패널을 열어 해당 탭으로 즉시 점프 (이미 열려 있으면 탭만 전환)
 * - 하단: 휴지통 + 설정 (spacer로 밀어냄)
 * - home / trash 는 항상 활성
 * - 섹션 / 퀵 점프 아이콘은 workSelected=false 일 때 disabled
 * - 선택된 항목은 좌측 2px 인디케이터 + 진한 색상
 */
export function ActivityBar({
  activity,
  onActivityChange,
  workSelected,
  settingsMode,
  onSettingsClick,
  rightPanelVisible,
  activeRightTab,
  onRightPanelQuickJump,
}: ActivityBarProps) {
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

  const renderQuickJump = (
    tab: 'idea' | 'ai' | 'inbox',
    Icon: LucideIcon,
    label: string,
  ) => {
    const isDisabled = !workSelected;
    const isActive = !isDisabled && rightPanelVisible && activeRightTab === tab;
    const title = isDisabled
      ? '작품을 먼저 선택하세요'
      : isActive
        ? `${label} 패널 닫기`
        : `${label} 패널 열기`;

    return (
      <button
        key={`quick-${tab}`}
        type="button"
        onClick={() => onRightPanelQuickJump(tab)}
        disabled={isDisabled}
        title={title}
        aria-label={`${label} 퀵 열기`}
        aria-current={isActive ? 'true' : undefined}
        className={cn(
          'relative flex h-11 w-11 items-center justify-center rounded-md transition-colors',
          isActive
            ? 'text-activity-bar-foreground'
            : 'text-muted-foreground hover:bg-activity-bar-accent hover:text-activity-bar-foreground',
          isDisabled && 'cursor-not-allowed opacity-40 hover:bg-transparent',
        )}
      >
        {isActive && (
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
      {/* 상단: 메인 액티비티 (좌측 사이드바 뷰 전환) */}
      {ACTIVITY_ORDER_MAIN.map(renderButton)}

      {/* 가로 세퍼레이터 — 메인 활동 vs 우측 패널 퀵 점프 시각 분리 */}
      <div
        role="separator"
        aria-orientation="horizontal"
        className="my-2 h-px w-7 bg-activity-bar-border"
      />

      {/* 우측 패널 퀵 점프 — 좌측 사이드바 뷰를 가지지 않고, 우측 패널만 열어준다 */}
      {QUICK_JUMP_ITEMS.map(({ tab, icon, label }) =>
        renderQuickJump(tab, icon, label),
      )}

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
