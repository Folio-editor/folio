import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  ClipboardList,
  GitBranch,
  Home,
  Lightbulb,
  ScrollText,
  Target,
  Users,
} from 'lucide-react';
import {
  Activity,
  ACTIVITY_LABELS,
  ACTIVITY_ORDER,
} from '../../types/workspace';
import { cn } from '../../lib/cn';

interface ActivityBarProps {
  activity: Activity;
  onActivityChange: (next: Activity) => void;
  workSelected: boolean;
}

const ACTIVITY_ICONS: Record<Activity, LucideIcon> = {
  home: Home,
  plan: ClipboardList,
  'world-note': BookOpen,
  character: Users,
  plot: GitBranch,
  episode: ScrollText,
  foreshadow: Target,
  'idea-archive': Lightbulb,
};

/**
 * VSCode 스타일 좁은 좌측 액티비티 바.
 * - home 은 항상 활성
 * - 섹션 아이콘은 workSelected=false 일 때 disabled
 * - 선택된 항목은 좌측 2px 인디케이터 + 진한 색상
 */
export function ActivityBar({ activity, onActivityChange, workSelected }: ActivityBarProps) {
  return (
    <nav
      className="flex w-14 shrink-0 flex-col items-center border-r border-gray-200 bg-gray-100 py-2"
      aria-label="액티비티 바"
    >
      {ACTIVITY_ORDER.map((item) => {
        const Icon = ACTIVITY_ICONS[item];
        const isActive = activity === item;
        const isDisabled = item !== 'home' && !workSelected;
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
                ? 'text-gray-900'
                : 'text-gray-500 hover:bg-gray-200 hover:text-gray-800',
              isDisabled && 'cursor-not-allowed opacity-40 hover:bg-transparent',
            )}
          >
            {isActive && !isDisabled && (
              <span
                aria-hidden
                className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r bg-blue-600"
              />
            )}
            <Icon size={20} strokeWidth={1.75} />
          </button>
        );
      })}
    </nav>
  );
}
