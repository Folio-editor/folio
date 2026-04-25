import { useState, useEffect, useCallback } from 'react';
import { usePowerSync } from '@powersync/react';
import { AppShell } from '../../components/layout/AppShell';
import { ActivityBar } from '../../components/layout/ActivityBar';
import { SecondarySidebar } from '../../components/layout/SecondarySidebar';
import { RightPanels } from '../../components/layout/RightPanels';
import { WorkspaceHomeOverview } from '../workspace/WorkspaceHomeOverview';
import { WorkspaceHomeScreen } from '../workspace/WorkspaceHomeScreen';
import { EmptyMainState } from '../workspace/EmptyMainState';
import { PlanSectionShell } from '../plan/PlanSectionShell';
import { WorldNoteScreen } from '../world-note/WorldNoteScreen';
import { CharacterOverview } from '../character/CharacterOverview';
import { CharacterNoteEditor } from '../character/CharacterNoteEditor';
import { PlotOverview } from '../plot/PlotOverview';
import { EpisodeEditScreen } from '../episode/EpisodeEditScreen';
import { ForeshadowEditScreen } from '../foreshadow/ForeshadowEditScreen';
import { IdeaArchiveEditScreen } from '../idea-archive/IdeaArchiveEditScreen';
import { TrashScreen } from '../trash/TrashScreen';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { useSyncResolver } from '../../hooks/useSyncResolver';
import { usePersistentState } from '../../hooks/usePersistentState';
import { SyncDecisionDialog } from './SyncDecisionDialog';
import { SettingsScreen } from '../settings/SettingsScreen';
import type { SettingsItemId } from '../../components/layout/sidebar-panels/SettingsList';
import {
  Activity, WorkspaceSection, AuxPanelItem, AUX_DRAG_MIME,
  type RightPanelTab, type ClickIntent, type MainDoc,
  docTypeToRoute, currentDocToAuxItem,
} from '../../types/workspace';

const SIDEBAR_MIN = 180;
const RIGHT_PANEL_MIN = 200;
// MAX 절대 상한은 두지 않는다 — 뷰포트 기반 동적 MAX 로 메인 패널 최소 너비만 보장.
const ACTIVITY_BAR_W = 56;
const MAIN_MIN_W = 320;

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

/**
 * 메인 에디터 화면 — Stage Manager 단순화 모델.
 *
 * 상태 모델:
 * - activity: 좌측 사이드바 뷰만 결정 (메인과 무관)
 * - selectedWorkId: 현재 작품
 * - mainDoc: 메인 스테이지 1슬롯 (section + itemId)
 * - auxPinned: 우측 서브 스테이지 N슬롯 (명시적 X로만 제거)
 *
 * 클릭 디스패치 (handleSidebarClick):
 * - default (단일 클릭): 메인에 즉시 열기 — 현 메인은 교체됨
 * - pin (더블 / ⌘+Click / 드래그): 우측 서브 스테이지에 적층
 *
 * 메인 보존이 필요하면 메인 헤더의 ↗(우측으로 보내기)를 먼저 누른 뒤 다음 항목 선택.
 *
 * useSyncResolver는 로그인 직후 sync 의사결정을 자동/수동으로 처리한다.
 */
export function AuthenticatedApp() {
  const db = usePowerSync();
  const [activity, setActivity] = useState<Activity>('home');
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(null);
  const [mainDoc, setMainDoc] = usePersistentState<MainDoc | null>('folio.ui.mainDoc', null);
  const [settingsMode, setSettingsMode] = useState(false);
  const [selectedSettingsItem, setSelectedSettingsItem] = useState<SettingsItemId | null>(null);
  const resolver = useSyncResolver();

  const { createWork, createWorldNote, createPlanNote, ensureWorldNoteTemplates } = useLocalWrite();

  // 세계관 탭 진입 시 기본 템플릿 자동 생성
  useEffect(() => {
    if (activity === 'world-note' && selectedWorkId) {
      void ensureWorldNoteTemplates(selectedWorkId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity, selectedWorkId]);

  // 레이아웃 상태 — localStorage 에 영속
  const [sidebarWidth, setSidebarWidth] = usePersistentState(
    'folio.ui.sidebarWidth',
    256,
  );
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistentState(
    'folio.ui.sidebarCollapsed',
    false,
  );
  const [rightPanelsWidth, setRightPanelsWidth] = usePersistentState(
    'folio.ui.rightPanelsWidth',
    288,
  );

  // ── 우측 서브 스테이지 (핀 슬롯) ──
  // auxPinned: 영속, key는 backward-compat로 'folio.ui.auxPanels' 그대로 유지
  const [auxPinned, setAuxPinned] = usePersistentState<AuxPanelItem[]>(
    'folio.ui.auxPanels',
    [],
  );
  const [isDraggingDoc, setIsDraggingDoc] = useState(false);
  const [rightPanelVisible, setRightPanelVisible] = usePersistentState(
    'folio.ui.rightPanelVisible',
    false,
  );
  const [rightPanelTab, setRightPanelTab] = usePersistentState<RightPanelTab>(
    'folio.ui.rightPanelTab',
    'docs',
  );
  const toggleRightPanel = useCallback(
    () => setRightPanelVisible((v) => !v),
    [setRightPanelVisible],
  );

  // 핀 슬롯 조작
  const addPinned = useCallback(
    (item: Omit<AuxPanelItem, 'id' | 'collapsed'>, index?: number) => {
      setAuxPinned((prev) => {
        if (prev.some((p) => p.docType === item.docType && p.docId === item.docId)) return prev;
        const newItem = { ...item, id: crypto.randomUUID(), collapsed: false };
        if (index !== undefined && index >= 0 && index <= prev.length) {
          const next = [...prev];
          next.splice(index, 0, newItem);
          return next;
        }
        return [...prev, newItem];
      });
    },
    [setAuxPinned],
  );
  const removePinned = useCallback(
    (panelId: string) =>
      setAuxPinned((prev) => prev.filter((p) => p.id !== panelId)),
    [setAuxPinned],
  );
  const reorderPinned = useCallback(
    (reordered: AuxPanelItem[]) => setAuxPinned(reordered),
    [setAuxPinned],
  );
  const togglePinnedCollapse = useCallback(
    (panelId: string) =>
      setAuxPinned((prev) =>
        prev.map((p) => (p.id === panelId ? { ...p, collapsed: !p.collapsed } : p)),
      ),
    [setAuxPinned],
  );

  // 드래그 시 자동으로 우측 패널 표시 + 핀 적층
  const addPinnedAndShow = useCallback(
    (item: Omit<AuxPanelItem, 'id' | 'collapsed'>, index?: number) => {
      if (!rightPanelVisible) setRightPanelVisible(true);
      addPinned(item, index);
    },
    [rightPanelVisible, setRightPanelVisible, addPinned],
  );

  // 특정 (section, itemId) 의 제목을 로컬 DB에서 조회
  const fetchItemTitle = useCallback(
    async (section: WorkspaceSection, itemId: string): Promise<string> => {
      const TITLE_QUERIES: Partial<Record<WorkspaceSection, { sql: string; id: string }>> = {
        'episode':    { sql: 'SELECT title FROM episode WHERE id = ?',            id: itemId },
        'world-note': { sql: 'SELECT name AS title FROM world_note WHERE id = ?', id: itemId },
        'plan':       { sql: 'SELECT title FROM plan_note WHERE id = ?',          id: itemId },
        'foreshadow': { sql: 'SELECT title FROM foreshadow WHERE id = ?',         id: itemId },
        'character':  itemId.startsWith('cnote:')
          ? { sql: 'SELECT title FROM character_note WHERE id = ?', id: itemId.slice(6) }
          : itemId.startsWith('char:')
            ? { sql: 'SELECT name AS title FROM character WHERE id = ?', id: itemId.slice(5) }
            : undefined,
      };
      const q = TITLE_QUERIES[section];
      if (!q) return '';
      try {
        const result = await db.execute(q.sql, [q.id]);
        return (result.rows?._array as { title: string }[])?.[0]?.title ?? '';
      } catch {
        return '';
      }
    },
    [db],
  );

  // ── 사이드바 클릭 디스패처 (단순화) ──
  // default(단일): 메인 즉시 교체 / pin(더블·⌘+클릭): 우측 핀 적층
  const handleSidebarClick = useCallback(
    async (section: WorkspaceSection, itemId: string, intent: ClickIntent) => {
      if (intent === 'pin') {
        const title = await fetchItemTitle(section, itemId);
        const aux = currentDocToAuxItem(section, itemId, title);
        if (aux) addPinnedAndShow(aux);
        return;
      }
      // default — 메인 즉시 교체 (현 메인은 사라짐. 보존하려면 ↗ 먼저)
      setMainDoc({ section, itemId });
    },
    [setMainDoc, addPinnedAndShow, fetchItemTitle],
  );

  // 우측 핀의 ↗(본문으로 열기) — 핀과 메인 swap
  // 현 메인을 핀 상단으로 보존 + 대상 패널을 메인으로 승격
  const handleOpenInMain = useCallback(
    async (panel: AuxPanelItem) => {
      const route = docTypeToRoute(panel.docType, panel.docId);
      if (!route || !route.itemId) return;

      if (mainDoc) {
        const currentTitle = await fetchItemTitle(mainDoc.section, mainDoc.itemId);
        const currentAux = currentDocToAuxItem(mainDoc.section, mainDoc.itemId, currentTitle);
        if (currentAux) addPinned(currentAux, 0);
      }

      setActivity(route.activity);
      setMainDoc({ section: route.section, itemId: route.itemId });
      removePinned(panel.id);
    },
    [mainDoc, fetchItemTitle, addPinned, removePinned, setMainDoc],
  );

  // 단축키: Ctrl+Shift+B → 우측 패널 토글
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'B') {
        e.preventDefault();
        toggleRightPanel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [toggleRightPanel]);

  // 문서 드래그 감지 — 패널 0개일 때도 드롭 존 표시
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes(AUX_DRAG_MIME)) setIsDraggingDoc(true);
    };
    const onDragEnd = () => setIsDraggingDoc(false);
    const onDrop = () => setIsDraggingDoc(false);
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('dragend', onDragEnd);
    document.addEventListener('drop', onDrop);
    return () => {
      document.removeEventListener('dragover', onDragOver);
      document.removeEventListener('dragend', onDragEnd);
      document.removeEventListener('drop', onDrop);
    };
  }, []);

  // 뷰포트 기반 동적 MAX 계산 — 메인 패널 최소 너비(MAIN_MIN_W) 보장.
  // 사용자가 사이드바를 자유롭게 넓힐 수 있되, 메인이 0이 되지는 않도록.
  const sidebarMaxAllowed = () =>
    Math.max(
      SIDEBAR_MIN,
      window.innerWidth - rightPanelsWidth - ACTIVITY_BAR_W - MAIN_MIN_W,
    );
  const rightPanelMaxAllowed = () =>
    Math.max(
      RIGHT_PANEL_MIN,
      window.innerWidth - sidebarWidth - ACTIVITY_BAR_W - MAIN_MIN_W,
    );

  const resizeSidebar = (delta: number) =>
    setSidebarWidth((w) => clamp(w + delta, SIDEBAR_MIN, sidebarMaxAllowed()));
  const resizeRightPanels = (delta: number) =>
    setRightPanelsWidth((w) => clamp(w + delta, RIGHT_PANEL_MIN, rightPanelMaxAllowed()));

  // ── 액티비티 / 작품 / 섹션 핸들러 ──
  // 핵심 변경: handleActivityChange는 mainDoc을 건드리지 않는다 (Stage Manager 모델)
  const handleActivityChange = (next: Activity) => {
    if (sidebarCollapsed) setSidebarCollapsed(false);
    setSettingsMode(false);
    setSelectedSettingsItem(null);
    setActivity(next);
    // mainDoc은 보존 — 사이드바 뷰만 갱신
  };

  const handleSettingsClick = () => {
    if (sidebarCollapsed) setSidebarCollapsed(false);
    setSettingsMode(true);
    setSelectedSettingsItem('account');
  };

  const handleWorkSelect = (id: string) => {
    setSelectedWorkId(id);
    // 작품 전환 = 작업 컨텍스트 전환 → 메인 정리
    setMainDoc(null);
  };

  // WorkspaceHomeScreen에서 섹션 카드 클릭 — 사이드바 뷰만 전환 (메인 보존)
  const handleSectionSelect = (section: WorkspaceSection) => {
    setActivity(section);
  };

  const handleNewWork = async (title: string) => {
    const id = await createWork(title);
    setSelectedWorkId(id);
    setMainDoc(null);
    setSidebarCollapsed(false);
    setActivity('home');
  };

  const handleNewWorldNote = async (parentId?: string | null) => {
    if (!selectedWorkId) return;
    const id = await createWorldNote(selectedWorkId, '새 문서', Date.now(), parentId);
    setMainDoc({ section: 'world-note', itemId: id });
    setSidebarCollapsed(false);
    setActivity('world-note');
  };

  const handleNewPlanNote = async () => {
    if (!selectedWorkId) return;
    const id = await createPlanNote(selectedWorkId, '새 문서', Date.now());
    setMainDoc({ section: 'plan', itemId: id });
    setSidebarCollapsed(false);
    setActivity('plan');
  };

  const handleNewWorkReset = () => {
    setSelectedWorkId(null);
    setMainDoc(null);
    setSidebarCollapsed(false);
    setActivity('home');
  };

  const handleWorkDeleted = () => {
    setSelectedWorkId(null);
    setMainDoc(null);
    setAuxPinned([]);
    setSidebarCollapsed(false);
    setActivity('home');
  };

  /** 크로스 섹션 네비게이션 — 플롯↔원고 연결 이동 등 */
  const handleNavigateTo = (section: WorkspaceSection, itemId: string | null) => {
    setActivity(section);
    setMainDoc(itemId ? { section, itemId } : null);
  };

  // 메인 ✕ — 메인을 즉시 비움 (현 문서는 사라짐. 보존하려면 ↗ 사용)
  const handleCloseMain = useCallback(() => {
    setMainDoc(null);
  }, [setMainDoc]);

  // 메인 ↗ — 현 문서를 핀 상단으로 옮기고 메인 비움
  const handleSendMainToRight = useCallback(async () => {
    if (!mainDoc) return;
    const title = await fetchItemTitle(mainDoc.section, mainDoc.itemId);
    const aux = currentDocToAuxItem(mainDoc.section, mainDoc.itemId, title);
    if (aux) addPinnedAndShow(aux, 0);
    setMainDoc(null);
  }, [mainDoc, fetchItemTitle, addPinnedAndShow, setMainDoc]);

  return (
    <>
      <AppShell
        activityBar={
          <ActivityBar
            activity={activity}
            onActivityChange={handleActivityChange}
            workSelected={selectedWorkId !== null}
            settingsMode={settingsMode}
            onSettingsClick={handleSettingsClick}
          />
        }
        sidebar={
          sidebarCollapsed || activity === 'trash' ? null : (
            <SecondarySidebar
              activity={activity}
              selectedWorkId={selectedWorkId}
              mainDoc={mainDoc}
              onWorkSelect={handleWorkSelect}
              onItemActivate={handleSidebarClick}
              onNewWork={(title: string) => void handleNewWork(title)}
              onNewWorldNote={(parentId?: string | null) => void handleNewWorldNote(parentId)}
              onNewPlanNote={() => void handleNewPlanNote()}
              width={sidebarWidth}
              onWidthChange={resizeSidebar}
              onCollapse={() => setSidebarCollapsed(true)}
              settingsMode={settingsMode}
              selectedSettingsItem={selectedSettingsItem}
              onSettingsItemSelect={setSelectedSettingsItem}
            />
          )
        }
        rightPanelToggle={toggleRightPanel}
        rightPanelVisible={rightPanelVisible}
        rightPanels={
          rightPanelVisible || isDraggingDoc ? (
            <RightPanels
              width={rightPanelsWidth}
              onWidthChange={resizeRightPanels}
              panels={auxPinned}
              onAddPanel={addPinnedAndShow}
              onRemovePanel={removePinned}
              onReorderPanels={reorderPinned}
              onToggleCollapse={togglePinnedCollapse}
              onOpenInMain={handleOpenInMain}
              isDraggingDoc={isDraggingDoc}
              activeTab={rightPanelTab}
              onTabChange={setRightPanelTab}
              selectedWorkId={selectedWorkId}
              mainDoc={mainDoc}
            />
          ) : null
        }
      >
        {settingsMode && selectedSettingsItem ? (
          <SettingsScreen settingsItemId={selectedSettingsItem} />
        ) : (
          renderMain({
            activity,
            workId: selectedWorkId,
            mainDoc,
            onSelectWork: handleWorkSelect,
            onDeselectWork: handleNewWorkReset,
            onCreateWork: handleNewWork,
            onSectionSelect: handleSectionSelect,
            onItemActivate: handleSidebarClick,
            onWorkDeleted: handleWorkDeleted,
            onNavigateTo: handleNavigateTo,
            onClose: () => void handleCloseMain(),
            onSendToRight: () => void handleSendMainToRight(),
          })
        )}
      </AppShell>

      {resolver.showDialog && (
        <SyncDecisionDialog
          guestRowCount={resolver.guestRowCount}
          busy={resolver.busy}
          onUseServer={() => void resolver.resolveUseServer()}
          onCancel={() => void resolver.cancel()}
        />
      )}

    </>
  );
}

interface RenderMainArgs {
  activity: Activity;
  workId: string | null;
  mainDoc: MainDoc | null;
  onSelectWork: (id: string) => void;
  onDeselectWork: () => void;
  onCreateWork: (title: string) => Promise<void>;
  onSectionSelect: (section: WorkspaceSection) => void;
  onItemActivate: (section: WorkspaceSection, itemId: string, intent: ClickIntent) => void;
  onWorkDeleted: () => void;
  onNavigateTo: (section: WorkspaceSection, itemId: string | null) => void;
  onClose: () => void;
  onSendToRight: () => void;
}

function renderMain({
  activity,
  workId,
  mainDoc,
  onSelectWork,
  onDeselectWork,
  onCreateWork,
  onSectionSelect,
  onItemActivate,
  onWorkDeleted,
  onNavigateTo,
  onClose,
  onSendToRight,
}: RenderMainArgs) {
  if (activity === 'trash') {
    return <TrashScreen />;
  }
  if (!workId) {
    return <WorkspaceHomeOverview onSelectWork={onSelectWork} onCreateWork={onCreateWork} />;
  }

  // mainDoc 있으면 해당 문서 에디터
  if (mainDoc) {
    return renderEditor({ mainDoc, workId, onClose, onSendToRight, onNavigateTo, onItemActivate });
  }

  // mainDoc 비어있을 때 — activity 별 빈/특수 화면
  if (activity === 'home') {
    return (
      <WorkspaceHomeScreen
        workId={workId}
        onSectionSelect={onSectionSelect}
        onDeleted={onWorkDeleted}
        onBack={onDeselectWork}
      />
    );
  }
  // 플롯은 막/회차 시각화 가치 있어 PlotOverview 보존 (예외)
  if (activity === 'plot') {
    return (
      <PlotOverview
        workId={workId}
        selectedItemId={null}
        onNavigateTo={onNavigateTo}
      />
    );
  }
  return <EmptyMainState activity={activity} />;
}

interface RenderEditorArgs {
  mainDoc: MainDoc;
  workId: string;
  onClose: () => void;
  onSendToRight: () => void;
  onNavigateTo: (section: WorkspaceSection, itemId: string | null) => void;
  onItemActivate: (section: WorkspaceSection, itemId: string, intent: ClickIntent) => void;
}

function renderEditor({
  mainDoc,
  workId,
  onClose,
  onSendToRight,
  onNavigateTo,
  onItemActivate,
}: RenderEditorArgs) {
  const { section, itemId } = mainDoc;

  switch (section) {
    case 'plan':
      return (
        <PlanSectionShell
          workId={workId}
          selectedItemId={itemId}
          onItemBack={onClose}
          onSendToRight={onSendToRight}
        />
      );
    case 'world-note':
      return (
        <WorldNoteScreen
          key={itemId}
          noteId={itemId}
          onBack={onClose}
          onSendToRight={onSendToRight}
        />
      );
    case 'character': {
      if (itemId.startsWith('char:')) {
        const charId = itemId.slice(5);
        return (
          <CharacterOverview
            characterId={charId}
            onBack={onClose}
            onSendToRight={onSendToRight}
            onNoteSelect={(noteId: string) =>
              onItemActivate('character', 'cnote:' + noteId, 'default')
            }
          />
        );
      }
      if (itemId.startsWith('cnote:')) {
        const noteId = itemId.slice(6);
        return (
          <CharacterNoteEditor
            key={noteId}
            noteId={noteId}
            onBack={onClose}
            onSendToRight={onSendToRight}
            onBackToCharacter={(charId) =>
              onItemActivate('character', 'char:' + charId, 'default')
            }
          />
        );
      }
      return null;
    }
    case 'plot':
      return (
        <PlotOverview
          workId={workId}
          selectedItemId={itemId}
          onNavigateTo={onNavigateTo}
        />
      );
    case 'episode':
      return (
        <EpisodeEditScreen
          key={itemId}
          id={itemId}
          onBack={onClose}
          onSendToRight={onSendToRight}
          onNavigateTo={onNavigateTo}
        />
      );
    case 'foreshadow':
      return (
        <ForeshadowEditScreen
          key={itemId}
          id={itemId}
          onBack={onClose}
          onSendToRight={onSendToRight}
        />
      );
    case 'idea-archive':
      return (
        <IdeaArchiveEditScreen
          key={itemId}
          id={itemId}
          onBack={onClose}
          onSendToRight={onSendToRight}
        />
      );
  }
  return null;
}
