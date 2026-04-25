import { useEffect, useState } from 'react';
import { useQuery } from '@powersync/react';
import { ChevronsLeft, LogOut, Monitor, Moon, Search, Sun } from 'lucide-react';
import { useThemeStore, type Theme } from '../../stores/themeStore';
import { useWriterId, useIsGuest } from '../../hooks/useWriterId';
import { useAuthStore } from '../../stores/authStore';
import {
  Activity,
  ACTIVITY_LABELS,
  WorkspaceSection,
  type ClickIntent,
  type MainDoc,
} from '../../types/workspace';
import { Input } from '../ui/Input';
import { HomeWorkList } from './sidebar-panels/HomeWorkList';
import { PlanNoteList } from './sidebar-panels/PlanNoteList';
import { WorldNoteList } from './sidebar-panels/WorldNoteList';
import { SectionItemList } from './sidebar-panels/SectionItemList';
import { CharacterNoteList } from './sidebar-panels/CharacterNoteList';
import { PlotTreeList } from './sidebar-panels/PlotTreeList';
import { EpisodeTreeList } from './sidebar-panels/EpisodeTreeList';
import { SettingsList, type SettingsItemId } from './sidebar-panels/SettingsList';
import { SyncStatusBar } from './SyncStatusBar';
import { ResizeHandle } from './ResizeHandle';

interface SecondarySidebarProps {
  activity: Activity;
  selectedWorkId: string | null;
  /** 메인 패널 문서 — 사이드바 항목 시각 하이라이트 결정 */
  mainDoc: MainDoc | null;
  onWorkSelect: (id: string) => void;
  /** 사이드바 항목 클릭 디스패처 (단일/더블/모디파이어 의도 분리) */
  onItemActivate: (section: WorkspaceSection, itemId: string, intent: ClickIntent) => void;
  onNewWork: (title: string) => void;
  onNewWorldNote: (parentId?: string | null) => void;
  onNewPlanNote: () => void;
  width: number;
  onWidthChange: (delta: number) => void;
  onCollapse: () => void;
  settingsMode?: boolean;
  selectedSettingsItem?: SettingsItemId | null;
  onSettingsItemSelect?: (id: SettingsItemId) => void;
}

interface WorkTitleRow {
  title: string;
}

/**
 * 와이어프레임 스펙의 보조 사이드바.
 *  ┌──────────────────┐
 *  │ Workspace Name   │  ← 현재 작품 제목 / 섹션 라벨
 *  │ [🔍 search     ] │
 *  │ ┌──────────────┐ │
 *  │ │   내용 영역   │ │  ← activity 에 따라 스위치
 *  │ └──────────────┘ │
 *  │ ○ 프로필          │
 *  └──────────────────┘
 *
 *  - activity === 'home': 작품 목록
 *  - activity === 'plan': 안내 문구 (1:1)
 *  - activity === 'world-note': 세계관 문서 리스트
 *  - 그 외 섹션: 범용 SectionItemList
 */
export function SecondarySidebar({
  activity,
  selectedWorkId,
  mainDoc,
  onWorkSelect,
  onItemActivate,
  onNewWork,
  onNewWorldNote,
  onNewPlanNote,
  width,
  onWidthChange,
  onCollapse,
  settingsMode,
  selectedSettingsItem,
  onSettingsItemSelect,
}: SecondarySidebarProps) {
  // 사이드바 항목 시각 하이라이트는 mainDoc 기반.
  // - mainDoc.section이 현 activity의 섹션과 일치하면 itemId로 하이라이트
  // - 그 외엔 null (다른 섹션 보고 있을 땐 사이드바 어떤 항목도 "현재 메인" 아님)
  const selectedItemId =
    mainDoc && (mainDoc.section as Activity) === activity ? mainDoc.itemId : null;
  const writerId = useWriterId();
  const isGuest = useIsGuest();
  const writer = useAuthStore((s) => s.writer);
  const login = useAuthStore((s) => s.login);
  const logout = useAuthStore((s) => s.logout);
  const isLoggingIn = useAuthStore((s) => s.isLoggingIn);

  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const [searchTerm, setSearchTerm] = useState('');

  // activity 전환 시 검색어 초기화
  useEffect(() => {
    setSearchTerm('');
  }, [activity]);

  const { data: workTitleRows = [] } = useQuery<WorkTitleRow>(
    selectedWorkId
      ? `SELECT title FROM work
         WHERE id = ? AND writer_id = ? AND status != 'trashed'
         LIMIT 1`
      : `SELECT '' AS title WHERE 0`,
    selectedWorkId ? [selectedWorkId, writerId] : [],
  );
  const workTitle = workTitleRows[0]?.title ?? null;

  const header = settingsMode
    ? 'Folio'
    : activity === 'home'
      ? 'Folio'
      : workTitle
        ? workTitle
        : '작품 미선택';

  const subHeader = settingsMode ? '설정' : ACTIVITY_LABELS[activity];

  const handleLoginClick = () => void login();

  const cycleTheme = () => {
    const order: Theme[] = ['light', 'dark', 'system'];
    setTheme(order[(order.indexOf(theme) + 1) % order.length]);
  };

  return (
    <aside
      style={{ width }}
      className="relative flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sm"
    >
      {/* 헤더 — 메인 패널 h-12와 높이 일치 */}
      <div className="flex h-12 shrink-0 items-center border-b border-sidebar-border px-4">
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-sidebar-foreground">{header}</div>
            {subHeader && (
              <div className="truncate text-[11px] text-muted-foreground">{subHeader}</div>
            )}
          </div>
          <button
            type="button"
            onClick={onCollapse}
            aria-label="사이드바 접기"
            title="사이드바 접기"
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <ChevronsLeft size={14} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* 검색 */}
      <div className="shrink-0 border-b border-sidebar-border/50 px-3 py-2">
        <div className="relative">
          <Search
            size={14}
            strokeWidth={2}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.currentTarget.value)}
            placeholder="검색"
            className="pl-7 text-xs"
          />
        </div>
      </div>

      {/* 콘텐츠 */}
      <div className="flex min-h-0 flex-1 flex-col">
        {settingsMode ? (
          <SettingsList
            selectedItemId={selectedSettingsItem ?? null}
            onItemSelect={onSettingsItemSelect ?? (() => {})}
          />
        ) : (
          renderContent({
            activity,
            selectedWorkId,
            selectedItemId,
            searchTerm,
            onWorkSelect,
            onItemActivate,
            onNewWork,
            onNewWorldNote,
            onNewPlanNote,
          })
        )}
      </div>

      {/* 프로필 풋터 */}
      <div className="flex shrink-0 flex-col gap-2 border-t border-sidebar-border p-3">
        {/* 동기화/네트워크 상태 — 게스트/인증 모두 상시 표시 */}
        <SyncStatusBar />

        {isGuest ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleLoginClick}
              disabled={isLoggingIn}
              className="flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-muted-foreground hover:bg-sidebar-accent disabled:opacity-50"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs">
                ○
              </span>
              <span className="truncate text-xs">
                {isLoggingIn ? '로그인 중…' : '게스트 — 로그인'}
              </span>
            </button>
            <ThemeToggle theme={theme} onCycle={cycleTheme} />
          </div>
        ) : (
          <div className="flex items-center gap-2 px-2 py-1.5">
            {writer?.profileImageUrl ? (
              <img src={writer.profileImageUrl} alt="" className="h-7 w-7 rounded-full" />
            ) : (
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">
                ●
              </span>
            )}
            <span className="flex-1 truncate text-xs text-sidebar-foreground">
              {writer?.nickname ?? writer?.email ?? ''}
            </span>
            <ThemeToggle theme={theme} onCycle={cycleTheme} />
            <button
              type="button"
              onClick={() => void logout()}
              aria-label="로그아웃"
              title="로그아웃"
              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <LogOut size={14} strokeWidth={2} />
            </button>
          </div>
        )}
      </div>

      {/* 리사이즈 핸들 (우측 엣지) */}
      <ResizeHandle
        side="right"
        onResize={onWidthChange}
        ariaLabel="사이드바 너비 조절"
      />
    </aside>
  );
}

function renderContent(args: {
  activity: Activity;
  selectedWorkId: string | null;
  selectedItemId: string | null;
  searchTerm: string;
  onWorkSelect: (id: string) => void;
  onItemActivate: (section: WorkspaceSection, itemId: string, intent: ClickIntent) => void;
  onNewWork: (title: string) => void;
  onNewWorldNote: (parentId?: string | null) => void;
  onNewPlanNote: () => void;
}) {
  const {
    activity,
    selectedWorkId,
    selectedItemId,
    searchTerm,
    onWorkSelect,
    onItemActivate,
    onNewWork,
    onNewWorldNote,
    onNewPlanNote,
  } = args;

  // 섹션별 panel용 onItemSelect 어댑터 — section을 미리 바인딩.
  // null은 panel 내부 expand/collapse 신호로 무시 (Stage Manager 모델: mainDoc은 보존).
  const makeItemHandler = (section: WorkspaceSection) =>
    (id: string | null, intent: ClickIntent = 'default') => {
      if (id === null) return;
      onItemActivate(section, id, intent);
    };

  if (activity === 'home') {
    return (
      <HomeWorkList
        selectedWorkId={selectedWorkId}
        searchTerm={searchTerm}
        onWorkSelect={onWorkSelect}
        onNewWork={onNewWork}
      />
    );
  }

  if (activity === 'trash') {
    return null;
  }

  if (!selectedWorkId) {
    return (
      <p className="px-4 py-6 text-center text-xs text-muted-foreground">
        좌측 홈(🏠)에서 작품을 먼저 선택하세요.
      </p>
    );
  }

  if (activity === 'plan') {
    return (
      <PlanNoteList
        workId={selectedWorkId}
        searchTerm={searchTerm}
        selectedItemId={selectedItemId}
        onItemSelect={makeItemHandler('plan')}
        onNewPlanNote={onNewPlanNote}
      />
    );
  }

  if (activity === 'world-note') {
    return (
      <WorldNoteList
        workId={selectedWorkId}
        searchTerm={searchTerm}
        selectedItemId={selectedItemId}
        onItemSelect={makeItemHandler('world-note')}
        onNewWorldNote={onNewWorldNote}
      />
    );
  }

  // character: 인물 트리 리스트 (인물 목록 + 선택 시 하위 노트 펼침)
  if (activity === 'character' && selectedWorkId) {
    return (
      <CharacterNoteList
        workId={selectedWorkId}
        searchTerm={searchTerm}
        selectedItemId={selectedItemId}
        onItemSelect={makeItemHandler('character')}
      />
    );
  }

  // plot: 막 > 회차 트리 리스트
  if (activity === 'plot' && selectedWorkId) {
    return (
      <PlotTreeList
        workId={selectedWorkId}
        searchTerm={searchTerm}
        selectedItemId={selectedItemId}
        onItemSelect={makeItemHandler('plot')}
      />
    );
  }

  // episode: 원고 리스트
  if (activity === 'episode' && selectedWorkId) {
    return (
      <EpisodeTreeList
        workId={selectedWorkId}
        searchTerm={searchTerm}
        selectedItemId={selectedItemId}
        onItemSelect={makeItemHandler('episode')}
      />
    );
  }

  // foreshadow / idea-archive
  const section = activity as Exclude<WorkspaceSection, 'plan' | 'world-note' | 'character' | 'plot' | 'episode'>;
  return (
    <SectionItemList
      section={section}
      workId={selectedWorkId}
      searchTerm={searchTerm}
      selectedItemId={selectedItemId}
      onItemSelect={makeItemHandler(section)}
    />
  );
}

const THEME_LABEL: Record<Theme, string> = {
  light: '라이트',
  dark: '다크',
  system: '시스템',
};

function ThemeToggle({ theme, onCycle }: { theme: Theme; onCycle: () => void }) {
  const Icon = theme === 'dark' ? Moon : theme === 'system' ? Monitor : Sun;
  return (
    <button
      type="button"
      onClick={onCycle}
      aria-label={`테마: ${THEME_LABEL[theme]}`}
      title={`테마: ${THEME_LABEL[theme]}`}
      className="shrink-0 rounded p-1 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <Icon size={14} strokeWidth={2} />
    </button>
  );
}
