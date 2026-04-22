import { useState, useEffect } from 'react';
import { usePowerSync } from '@powersync/react';
import { AppShell } from '../../components/layout/AppShell';
import { ActivityBar } from '../../components/layout/ActivityBar';
import { SecondarySidebar } from '../../components/layout/SecondarySidebar';
import { RightPanels } from '../../components/layout/RightPanels';
import { WorkspaceHomeOverview } from '../workspace/WorkspaceHomeOverview';
import { WorkspaceHomeScreen } from '../workspace/WorkspaceHomeScreen';
import { PlanSectionShell } from '../plan/PlanSectionShell';
import { WorldNoteScreen } from '../world-note/WorldNoteScreen';
import { WorldNoteOverview } from '../world-note/WorldNoteOverview';
import { CharacterOverviewAll } from '../character/CharacterOverviewAll';
import { CharacterOverview } from '../character/CharacterOverview';
import { CharacterNoteEditor } from '../character/CharacterNoteEditor';
import { PlotOverview } from '../plot/PlotOverview';
import { EpisodeOverview } from '../episode/EpisodeOverview';
import { EpisodeEditScreen } from '../episode/EpisodeEditScreen';
import { ForeshadowOverview } from '../foreshadow/ForeshadowOverview';
import { ForeshadowEditScreen } from '../foreshadow/ForeshadowEditScreen';
import { IdeaArchiveListScreen } from '../idea-archive/IdeaArchiveListScreen';
import { IdeaArchiveEditScreen } from '../idea-archive/IdeaArchiveEditScreen';
import { TrashScreen } from '../trash/TrashScreen';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { useSyncResolver } from '../../hooks/useSyncResolver';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useSpellCheckerDictionarySync } from '../../hooks/useSpellCheckerDictionarySync';
import { SyncDecisionDialog } from './SyncDecisionDialog';
import { SettingsScreen } from '../settings/SettingsScreen';
import type { SettingsItemId } from '../../components/layout/sidebar-panels/SettingsList';
import {
  Activity, WorkspaceSection, AuxPanelItem, AUX_DRAG_MIME,
  type RightPanelTab, docTypeToRoute, currentDocToAuxItem,
} from '../../types/workspace';

const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 480;
const RIGHT_PANEL_MIN = 200;
const RIGHT_PANEL_MAX = 600;

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

/**
 * 메인 에디터 화면.
 * 상태는 넷: activity(액티비티 바) / selectedWorkId / selectedSection / selectedItemId.
 * - activity 는 좁은 좌측 아이콘 바에서 선택 — home 또는 WorkspaceSection
 * - activity 변경 시 selectedSection 동기화
 *
 * useSyncResolver는 로그인 직후 sync 의사결정을 자동/수동으로 처리한다.
 */
export function AuthenticatedApp() {
  const db = usePowerSync();
  const [activity, setActivity] = useState<Activity>('home');
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<WorkspaceSection | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [settingsMode, setSettingsMode] = useState(false);
  const [selectedSettingsItem, setSelectedSettingsItem] = useState<SettingsItemId | null>(null);
  const resolver = useSyncResolver();
  useSpellCheckerDictionarySync(selectedWorkId);

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

  // ── 우측 보조 패널 상태 ──
  const [auxPanels, setAuxPanels] = usePersistentState<AuxPanelItem[]>(
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
  const toggleRightPanel = () => setRightPanelVisible((v) => !v);

  const addAuxPanel = (item: Omit<AuxPanelItem, 'id' | 'collapsed'>, index?: number) => {
    setAuxPanels((prev) => {
      if (prev.some((p) => p.docType === item.docType && p.docId === item.docId)) return prev;
      const newItem = { ...item, id: crypto.randomUUID(), collapsed: false };
      if (index !== undefined && index >= 0 && index <= prev.length) {
        const next = [...prev];
        next.splice(index, 0, newItem);
        return next;
      }
      return [...prev, newItem];
    });
  };
  const removeAuxPanel = (panelId: string) =>
    setAuxPanels((prev) => prev.filter((p) => p.id !== panelId));
  const reorderAuxPanels = (reordered: AuxPanelItem[]) =>
    setAuxPanels(reordered);
  const toggleAuxPanelCollapse = (panelId: string) =>
    setAuxPanels((prev) =>
      prev.map((p) => (p.id === panelId ? { ...p, collapsed: !p.collapsed } : p)),
    );

  // 현재 본문 문서의 제목을 로컬 DB에서 조회
  const fetchCurrentDocTitle = async (): Promise<string> => {
    if (!selectedSection || !selectedItemId) return '';
    const TITLE_QUERIES: Partial<Record<WorkspaceSection, { sql: string; id: string }>> = {
      'episode':    { sql: 'SELECT title FROM episode WHERE id = ?',        id: selectedItemId },
      'world-note': { sql: 'SELECT name AS title FROM world_note WHERE id = ?', id: selectedItemId },
      'plan':       { sql: 'SELECT title FROM plan_note WHERE id = ?',      id: selectedItemId },
      'foreshadow': { sql: 'SELECT title FROM foreshadow WHERE id = ?',     id: selectedItemId },
      'character':  selectedItemId.startsWith('cnote:')
        ? { sql: 'SELECT title FROM character_note WHERE id = ?', id: selectedItemId.slice(6) }
        : selectedItemId.startsWith('char:')
          ? { sql: 'SELECT name AS title FROM character WHERE id = ?', id: selectedItemId.slice(5) }
          : undefined,
    };
    const q = TITLE_QUERIES[selectedSection];
    if (!q) return '';
    try {
      const result = await db.execute(q.sql, [q.id]);
      return (result.rows?._array as { title: string }[])?.[0]?.title ?? '';
    } catch {
      return '';
    }
  };

  // 우측 패널 문서를 본문으로 열기 (swap)
  const handleOpenInMain = async (panel: AuxPanelItem) => {
    const route = docTypeToRoute(panel.docType, panel.docId);
    if (!route) return;

    // 1. 현재 본문 문서를 우측 패널에 추가 (제목 조회 후)
    if (selectedSection && selectedItemId) {
      const title = await fetchCurrentDocTitle();
      const currentAux = currentDocToAuxItem(selectedSection, selectedItemId, title);
      if (currentAux) addAuxPanel(currentAux);
    }

    // 2. 대상 문서를 본문으로 열기
    setActivity(route.activity);
    setSelectedSection(route.section);
    setSelectedItemId(route.itemId);

    // 3. 우측 패널에서 해당 문서 제거
    removeAuxPanel(panel.id);
  };

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

  // 드래그 시 자동으로 우측 패널 표시
  const addAuxPanelAndShow = (item: Omit<AuxPanelItem, 'id' | 'collapsed'>, index?: number) => {
    if (!rightPanelVisible) setRightPanelVisible(true);
    addAuxPanel(item, index);
  };

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

  const resizeSidebar = (delta: number) =>
    setSidebarWidth((w) => clamp(w + delta, SIDEBAR_MIN, SIDEBAR_MAX));
  const resizeRightPanels = (delta: number) =>
    setRightPanelsWidth((w) => clamp(w + delta, RIGHT_PANEL_MIN, RIGHT_PANEL_MAX));

  const handleActivityChange = (next: Activity) => {
    if (sidebarCollapsed) setSidebarCollapsed(false);
    setSettingsMode(false);
    setSelectedSettingsItem(null);
    setActivity(next);
    setSelectedItemId(null);
    if (next === 'home' || next === 'trash') {
      // home/trash 로 전환 시 섹션만 초기화 — 선택된 작품은 보존
      setSelectedSection(null);
    } else {
      setSelectedSection(next);
    }
  };

  const handleSettingsClick = () => {
    if (sidebarCollapsed) setSidebarCollapsed(false);
    setSettingsMode(true);
    setSelectedSettingsItem('theme');
  };

  const handleWorkSelect = (id: string) => {
    setSelectedWorkId(id);
    setSelectedSection(null);
    setSelectedItemId(null);
  };

  const handleSectionSelect = (section: WorkspaceSection) => {
    setSelectedSection(section);
    setSelectedItemId(null);
    setActivity(section);
  };

  const handleNewWork = async (title: string) => {
    const id = await createWork(title);
    setSelectedWorkId(id);
    setSelectedSection(null);
    setSelectedItemId(null);
    setSidebarCollapsed(false);
    setActivity('home');
  };

  const handleNewWorldNote = async (parentId?: string | null) => {
    if (!selectedWorkId) return;
    const id = await createWorldNote(selectedWorkId, '새 문서', Date.now(), parentId);
    setSelectedSection('world-note');
    setSelectedItemId(id);
    setSidebarCollapsed(false);
    setActivity('world-note');
  };

  const handleNewPlanNote = async () => {
    if (!selectedWorkId) return;
    const id = await createPlanNote(selectedWorkId, '새 문서', Date.now());
    setSelectedSection('plan');
    setSelectedItemId(id);
    setSidebarCollapsed(false);
    setActivity('plan');
  };

  const handleNewWorkReset = () => {
    // WorkspaceScreen 진입 — 작품 목록에서 "+ 새 작품" 인라인 생성을 위해 선택 초기화
    setSelectedWorkId(null);
    setSelectedSection(null);
    setSelectedItemId(null);
    setSidebarCollapsed(false);
    setActivity('home');
  };

  const handleWorkDeleted = () => {
    // 작품 삭제 완료 → 선택 초기화 후 홈으로 이동
    setSelectedWorkId(null);
    setSelectedSection(null);
    setSelectedItemId(null);
    setSidebarCollapsed(false);
    setActivity('home');
  };

  /** 크로스 섹션 네비게이션 — 플롯↔원고 연결 이동 등 */
  const handleNavigateTo = (section: WorkspaceSection, itemId: string | null) => {
    setActivity(section);
    setSelectedSection(section);
    setSelectedItemId(itemId);
  };

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
              selectedItemId={selectedItemId}
              onWorkSelect={handleWorkSelect}
              onItemSelect={setSelectedItemId}
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
              panels={auxPanels}
              onAddPanel={addAuxPanelAndShow}
              onRemovePanel={removeAuxPanel}
              onReorderPanels={reorderAuxPanels}
              onToggleCollapse={toggleAuxPanelCollapse}
              onOpenInMain={handleOpenInMain}
              isDraggingDoc={isDraggingDoc}
              activeTab={rightPanelTab}
              onTabChange={setRightPanelTab}
              selectedWorkId={selectedWorkId}
              mainSection={selectedSection}
              mainItemId={selectedItemId}
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
            section: selectedSection,
            itemId: selectedItemId,
            onSelectWork: handleWorkSelect,
            onDeselectWork: handleNewWorkReset,
            onCreateWork: handleNewWork,
            onSectionSelect: handleSectionSelect,
            onItemSelect: setSelectedItemId,
            onWorkDeleted: handleWorkDeleted,
            onNavigateTo: handleNavigateTo,
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
  section: WorkspaceSection | null;
  itemId: string | null;
  onSelectWork: (id: string) => void;
  onDeselectWork: () => void;
  onCreateWork: (title: string) => Promise<void>;
  onSectionSelect: (section: WorkspaceSection) => void;
  onItemSelect: (id: string | null) => void;
  onWorkDeleted: () => void;
  onNavigateTo: (section: WorkspaceSection, itemId: string | null) => void;
}

function renderMain({
  activity,
  workId,
  section,
  itemId,
  onSelectWork,
  onDeselectWork,
  onCreateWork,
  onSectionSelect,
  onItemSelect,
  onWorkDeleted,
  onNavigateTo,
}: RenderMainArgs) {
  if (activity === 'trash') {
    return <TrashScreen />;
  }
  if (!workId) {
    return <WorkspaceHomeOverview onSelectWork={onSelectWork} onCreateWork={onCreateWork} />;
  }
  if (!section) {
    return (
      <WorkspaceHomeScreen
        workId={workId}
        onSectionSelect={onSectionSelect}
        onDeleted={onWorkDeleted}
        onBack={onDeselectWork}
      />
    );
  }

  const back = () => onItemSelect(null);

  switch (section) {
    case 'plan':
      return (
        <PlanSectionShell
          workId={workId}
          selectedItemId={itemId}
          onItemSelect={onItemSelect}
          onItemBack={back}
        />
      );
    case 'world-note':
      return itemId ? (
        <WorldNoteScreen key={itemId} noteId={itemId} onBack={() => onItemSelect(null)} />
      ) : workId ? (
        <WorldNoteOverview workId={workId} onNoteSelect={onItemSelect} />
      ) : (
        <EmptyDetail message="좌측 사이드바에서 세계관 문서를 선택하거나 새로 추가하세요." />
      );
    case 'character': {
      if (!itemId) {
        return <CharacterOverviewAll workId={workId} onSelect={onItemSelect} />;
      }
      if (itemId.startsWith('char:')) {
        const charId = itemId.slice(5);
        return (
          <CharacterOverview
            characterId={charId}
            onBack={back}
            onNoteSelect={(noteId: string) => onItemSelect('cnote:' + noteId)}
          />
        );
      }
      if (itemId.startsWith('cnote:')) {
        const noteId = itemId.slice(6);
        return (
          <CharacterNoteEditor
            key={noteId}
            noteId={noteId}
            onBack={back}
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
      return itemId ? (
        <EpisodeEditScreen key={itemId} id={itemId} onBack={back} onNavigateTo={onNavigateTo} />
      ) : (
        <EpisodeOverview workId={workId} onSelect={onItemSelect} />
      );
    case 'foreshadow':
      return itemId ? (
        <ForeshadowEditScreen key={itemId} id={itemId} onBack={back} />
      ) : (
        <ForeshadowOverview workId={workId} onSelect={onItemSelect} />
      );
    case 'idea-archive':
      return itemId ? (
        <IdeaArchiveEditScreen key={itemId} id={itemId} onBack={back} />
      ) : (
        <IdeaArchiveListScreen workId={workId} onSelect={onItemSelect} />
      );
  }
}

function EmptyDetail({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center px-8 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
