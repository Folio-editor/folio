import { useEffect, useState } from 'react';
import { useQuery } from '@powersync/react';
import { ChevronsLeft, LogOut, Search } from 'lucide-react';
import { useWriterId, useIsGuest } from '../../hooks/useWriterId';
import { useAuthStore } from '../../stores/authStore';
import {
  Activity,
  ACTIVITY_LABELS,
  WorkspaceSection,
} from '../../types/workspace';
import { Input } from '../ui/Input';
import { HomeWorkList } from './sidebar-panels/HomeWorkList';
import { PlanNoteList } from './sidebar-panels/PlanNoteList';
import { WorldNoteList } from './sidebar-panels/WorldNoteList';
import { SectionItemList } from './sidebar-panels/SectionItemList';
import { SyncStatusBar } from './SyncStatusBar';
import { ResizeHandle } from './ResizeHandle';

interface SecondarySidebarProps {
  activity: Activity;
  selectedWorkId: string | null;
  selectedItemId: string | null;
  onWorkSelect: (id: string) => void;
  onItemSelect: (id: string | null) => void;
  onNewWork: () => void;
  onNewWorldNote: () => void;
  onNewPlanNote: () => void;
  width: number;
  onWidthChange: (delta: number) => void;
  onCollapse: () => void;
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
  selectedItemId,
  onWorkSelect,
  onItemSelect,
  onNewWork,
  onNewWorldNote,
  onNewPlanNote,
  width,
  onWidthChange,
  onCollapse,
}: SecondarySidebarProps) {
  const writerId = useWriterId();
  const isGuest = useIsGuest();
  const writer = useAuthStore((s) => s.writer);
  const login = useAuthStore((s) => s.login);
  const logout = useAuthStore((s) => s.logout);
  const isLoggingIn = useAuthStore((s) => s.isLoggingIn);

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

  const header =
    activity === 'home'
      ? '작품'
      : workTitle
        ? workTitle
        : '작품 미선택';

  const subHeader = activity === 'home' ? null : ACTIVITY_LABELS[activity];

  const handleLoginClick = () => void login();

  return (
    <aside
      style={{ width }}
      className="relative flex shrink-0 flex-col border-r border-gray-200 bg-white text-sm"
    >
      {/* 헤더 */}
      <div className="shrink-0 border-b border-gray-200 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-gray-900">{header}</div>
            {subHeader && (
              <div className="mt-0.5 truncate text-xs text-gray-500">{subHeader}</div>
            )}
          </div>
          <button
            type="button"
            onClick={onCollapse}
            aria-label="사이드바 접기"
            title="사이드바 접기"
            className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <ChevronsLeft size={14} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* 검색 */}
      <div className="shrink-0 border-b border-gray-100 px-3 py-2">
        <div className="relative">
          <Search
            size={14}
            strokeWidth={2}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
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
      <div className="min-h-0 flex-1 overflow-y-auto">
        {renderContent({
          activity,
          selectedWorkId,
          selectedItemId,
          searchTerm,
          onWorkSelect,
          onItemSelect,
          onNewWork,
          onNewWorldNote,
          onNewPlanNote,
        })}
      </div>

      {/* 동기화 상태 바 */}
      <SyncStatusBar />

      {/* 프로필 풋터 */}
      <div className="shrink-0 border-t border-gray-200 p-3">
        {isGuest ? (
          <button
            type="button"
            onClick={handleLoginClick}
            disabled={isLoggingIn}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-gray-500 hover:bg-gray-100 disabled:opacity-50"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-xs">
              ○
            </span>
            <span className="truncate text-xs">
              {isLoggingIn ? '로그인 중…' : '게스트 — 로그인'}
            </span>
          </button>
        ) : (
          <div className="flex items-center gap-2 px-2 py-1.5">
            {writer?.profileImageUrl ? (
              <img src={writer.profileImageUrl} alt="" className="h-7 w-7 rounded-full" />
            ) : (
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs text-blue-600">
                ●
              </span>
            )}
            <span className="flex-1 truncate text-xs text-gray-700">
              {writer?.nickname ?? writer?.email ?? ''}
            </span>
            <button
              type="button"
              onClick={() => void logout()}
              aria-label="로그아웃"
              title="로그아웃"
              className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
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
  onItemSelect: (id: string | null) => void;
  onNewWork: () => void;
  onNewWorldNote: () => void;
  onNewPlanNote: () => void;
}) {
  const {
    activity,
    selectedWorkId,
    selectedItemId,
    searchTerm,
    onWorkSelect,
    onItemSelect,
    onNewWork,
    onNewWorldNote,
    onNewPlanNote,
  } = args;

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

  if (!selectedWorkId) {
    return (
      <p className="px-4 py-6 text-center text-xs text-gray-400">
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
        onItemSelect={onItemSelect}
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
        onItemSelect={onItemSelect}
        onNewWorldNote={onNewWorldNote}
      />
    );
  }

  // character / plot / episode / foreshadow / idea-archive
  const section = activity as Exclude<WorkspaceSection, 'plan' | 'world-note'>;
  return (
    <SectionItemList
      section={section}
      workId={selectedWorkId}
      searchTerm={searchTerm}
      selectedItemId={selectedItemId}
      onItemSelect={onItemSelect}
    />
  );
}
