import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@powersync/react';
import { ChevronsLeft, HelpCircle, LogOut, Monitor, Moon, Search, Sun } from 'lucide-react';
import { FloatingHelpCard } from '../ui/FloatingHelpCard';
import { TAB_HELP } from '../../constants/tabHelpContent';
import { cn } from '../../lib/cn';
import { useThemeStore, type Theme } from '../../stores/themeStore';
import { useWriterId, useIsGuest } from '../../hooks/useWriterId';
import { useDecryptedWork } from '../../hooks/useDecryptedWork';
import { useDecryptedWorldNoteList, type RawWorldNoteRow } from '../../hooks/useDecryptedWorldNote';
import { useAuthStore } from '../../stores/authStore';
import {
  Activity,
  WorkspaceSection,
  type ClickIntent,
  type MainDoc,
} from '../../types/workspace';
import { Input } from '../ui/Input';
import { TAG_LIST } from '../../features/idea-archive/ideaConstants';
import {
  SidebarFilterPicker,
  type FilterOption,
} from './sidebar-panels/SidebarFilterPicker';
import type { SortPanelKey } from '../../stores/sortPreferenceStore';
import { useFilterPreferenceStore } from '../../stores/filterPreferenceStore';
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

// activity별 필터 옵션 명세 — 검색창 옆 필터 아이콘이 자동 분기 렌더
interface ActivityFilterSpec {
  panelKey: SortPanelKey;
  options: FilterOption[];
  groupLabel: string;
}

/** activity 당 여러 spec 가능 (예: character는 gender + tag 두 그룹) */
const ACTIVITY_FILTER_SPEC: Partial<Record<Activity, ActivityFilterSpec[]>> = {
  episode: [
    {
      panelKey: 'episode',
      groupLabel: '진행 상태',
      options: [
        { value: '예정', label: '예정' },
        { value: '초고', label: '초고' },
        { value: '퇴고', label: '퇴고' },
        { value: '완성', label: '완성' },
      ],
    },
  ],
  plot: [
    {
      panelKey: 'plot',
      groupLabel: '회차 상태',
      options: [
        { value: '예정', label: '예정' },
        { value: '작성중', label: '작성중' },
        { value: '완료', label: '완료' },
      ],
    },
  ],
  // character — tag(dynamic, world_note 목록)만 지원. gender 필터는 제거.
  character: [
    {
      panelKey: 'character-tag',
      groupLabel: '태그(세계관)',
      options: [],
    },
  ],
  foreshadow: [
    {
      panelKey: 'foreshadow',
      groupLabel: '중요도',
      options: [
        { value: '상', label: '상' },
        { value: '중', label: '중' },
        { value: '하', label: '하' },
      ],
    },
  ],
  'idea-archive': [
    {
      panelKey: 'idea-archive',
      groupLabel: '태그',
      options: TAG_LIST.map((t) => ({ value: t, label: t })),
    },
  ],
};

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

interface WorkOwnershipRow {
  id: string;
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

  // PR2 — title이 v1: 암호문일 수 있어 batch 복호화 훅으로 평문을 얻는다.
  // ownership/trashed 검증은 별도 lightweight 쿼리로 분리 (hook은 단일 work 무조건 SELECT).
  const { data: ownershipRows = [] } = useQuery<WorkOwnershipRow>(
    selectedWorkId
      ? `SELECT id FROM work
         WHERE id = ? AND writer_id = ? AND status != 'trashed'
         LIMIT 1`
      : `SELECT NULL AS id WHERE 0`,
    selectedWorkId ? [selectedWorkId, writerId] : [],
  );
  const ownsWork = ownershipRows.length > 0;
  const { data: decryptedWork } = useDecryptedWork(
    ownsWork && selectedWorkId ? selectedWorkId : '',
  );
  const workTitle = ownsWork ? decryptedWork?.title ?? null : null;

  const header = settingsMode
    ? 'Folio'
    : activity === 'home'
      ? 'Folio'
      : workTitle
        ? workTitle
        : '작품 미선택';

  const handleLoginClick = () => void login();

  const cycleTheme = () => {
    const order: Theme[] = ['light', 'dark', 'system'];
    setTheme(order[(order.indexOf(theme) + 1) % order.length]);
  };

  // ── 탭별 컨텍스트 도움말 ─────────────────────────────────────
  // 활동 탭별로 ? 버튼을 노출하고, 첫 진입 시 자동으로 1회 노출. 이후엔 수동 토글.
  // settingsMode 시에는 도움말 미제공.
  const tabHelp = settingsMode ? undefined : TAB_HELP[activity];
  const [helpOpen, setHelpOpen] = useState(false);
  const helpButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!tabHelp) {
      setHelpOpen(false);
      return;
    }
    const key = `folio.tabHelp.${activity}.shown`;
    if (localStorage.getItem(key)) {
      setHelpOpen(false);
      return;
    }
    setHelpOpen(true);
    localStorage.setItem(key, 'true');
  }, [activity, tabHelp]);

  return (
    <aside
      style={{ width }}
      className="relative flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sm"
    >
      {/* 헤더 — 작품 제목 (h-10) + 도움말/접기 버튼 */}
      <div className="flex h-10 shrink-0 items-center border-b border-sidebar-border px-4">
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <div className="min-w-0 flex-1 truncate text-sm font-semibold text-sidebar-foreground">
            {header}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {tabHelp && (
              <button
                ref={helpButtonRef}
                type="button"
                onClick={() => setHelpOpen((v) => !v)}
                aria-label="이 탭 도움말"
                aria-pressed={helpOpen}
                title={helpOpen ? '도움말 닫기' : '이 탭 도움말'}
                className={cn(
                  'rounded p-1 transition-colors',
                  helpOpen
                    ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                    : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                )}
              >
                <HelpCircle size={14} strokeWidth={2} />
              </button>
            )}
            <button
              type="button"
              onClick={onCollapse}
              aria-label="사이드바 접기"
              title="사이드바 접기"
              className="rounded p-1 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <ChevronsLeft size={14} strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>

      {/* 검색 + 필터 — 메인 헤더(h-10)와 가로선 정렬 위해 동일 높이 */}
      <div className="flex h-10 shrink-0 items-center border-b border-sidebar-border/50 px-3">
        <div className="flex w-full items-center gap-1.5">
          <div className="relative min-w-0 flex-1">
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
              className="h-7 pl-7 text-xs"
            />
          </div>
          <ActivityFilters
            activity={activity}
            workId={selectedWorkId}
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
          <div className="flex flex-col gap-1.5">
            {/* 프로필 — 닉네임 + 테마 + 로그아웃 */}
            <div className="flex items-center gap-2 px-2 py-1.5">
              {writer?.profileImageUrl ? (
                // referrerPolicy="no-referrer" — Google lh3.googleusercontent.com 이
                // localhost / app:// referrer 에 대해 403/429 반환하는 회귀 차단.
                // (landing 페이지와 동일 정책)
                <img
                  src={writer.profileImageUrl}
                  alt=""
                  className="h-7 w-7 rounded-full"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">
                  ●
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-xs text-sidebar-foreground">
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
          </div>
        )}
      </div>

      {/* 리사이즈 핸들 (우측 엣지) */}
      <ResizeHandle
        side="right"
        onResize={onWidthChange}
        ariaLabel="사이드바 너비 조절"
      />

      {/* 탭별 컨텍스트 도움말 — 화면 중앙 플로팅 카드 (드래그/리사이즈 가능, 비차단) */}
      {tabHelp && (
        <FloatingHelpCard
          open={helpOpen}
          title={tabHelp.title}
          steps={tabHelp.steps}
          onClose={() => setHelpOpen(false)}
          persistKey="folio.tabHelp.position.v3"
          originRef={helpButtonRef}
        />
      )}
    </aside>
  );
}

/** activity별 필터 picker 렌더 — 다중 spec 지원 + character의 tag 옵션은 world_note 동적 fetch */
function ActivityFilters({
  activity,
  workId,
}: {
  activity: Activity;
  workId: string | null;
}) {
  const specs = ACTIVITY_FILTER_SPEC[activity];
  const selectedByPanel = useFilterPreferenceStore((s) => s.byPanel);
  const setFilter = useFilterPreferenceStore((s) => s.set);
  const clearFilter = useFilterPreferenceStore((s) => s.clear);

  // character 패널일 때만 — 작품 내 캐릭터 중 한 명에라도 태그로 등록된 world_note만 옵션
  // (전체 world_note가 아니라 실제 사용 중인 태그만)
  const isCharacter = activity === 'character';
  const { data: rawWorldNoteRows = [] } = useQuery<RawWorldNoteRow>(
    isCharacter && workId
      ? `SELECT DISTINCT wn.id, wn.work_id, wn.writer_id, wn.parent_id,
                wn.name, wn.content, wn.sort_order, wn.created_at, wn.updated_at,
                w.encrypted_dek AS encrypted_dek
         FROM world_note wn
         JOIN character_tag ct ON ct.world_note_id = wn.id
         JOIN character c ON c.id = ct.character_id
         LEFT JOIN work w ON w.id = wn.work_id
         WHERE c.work_id = ?
         ORDER BY wn.sort_order ASC, wn.created_at ASC`
      : `SELECT NULL AS id, NULL AS work_id, NULL AS writer_id, NULL AS parent_id,
                NULL AS name, NULL AS content, NULL AS sort_order,
                NULL AS created_at, NULL AS updated_at,
                NULL AS encrypted_dek WHERE 0`,
    isCharacter && workId ? [workId] : [],
  );
  const { data: decryptedWorldNoteRows } = useDecryptedWorldNoteList(rawWorldNoteRows);
  const tagOptions: FilterOption[] = useMemo(
    () =>
      isCharacter
        ? decryptedWorldNoteRows
            .filter((r) => r.id)
            .map((r) => ({ value: r.id, label: r.name?.trim() || '(이름 없음)' }))
        : [],
    [isCharacter, decryptedWorldNoteRows],
  );

  useEffect(() => {
    if (!isCharacter) return;
    const selected = selectedByPanel['character-tag'] ?? [];
    if (selected.length === 0) return;

    const validValues = new Set(tagOptions.map((option) => option.value));
    const next = selected.filter((value) => validValues.has(value));

    if (next.length === selected.length) return;
    if (next.length === 0) clearFilter('character-tag');
    else setFilter('character-tag', next);
  }, [clearFilter, isCharacter, selectedByPanel, setFilter, tagOptions]);

  if (!specs || specs.length === 0) return null;

  return (
    <>
      {specs.map((spec) => {
        // character-tag spec은 동적 옵션
        const options =
          spec.panelKey === 'character-tag' ? tagOptions : spec.options;
        return (
          <SidebarFilterPicker
            key={spec.panelKey}
            panelKey={spec.panelKey}
            options={options}
            groupLabel={spec.groupLabel}
            emptyMessage={
              spec.panelKey === 'character-tag'
                ? '태그가 설정된 등장인물이 없습니다.'
                : undefined
            }
          />
        );
      })}
    </>
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
