import { useState, useEffect } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { ActivityBar } from '../../components/layout/ActivityBar';
import { SecondarySidebar } from '../../components/layout/SecondarySidebar';
import { RightPanels } from '../../components/layout/RightPanels';
import { WorkspaceScreen } from '../workspace/WorkspaceScreen';
import { WorkspaceHomeScreen } from '../workspace/WorkspaceHomeScreen';
import { PlanSectionShell } from '../plan/PlanSectionShell';
import { WorldNoteScreen } from '../world-note/WorldNoteScreen';
import { WorldNoteOverview } from '../world-note/WorldNoteOverview';
import { CharacterOverviewAll } from '../character/CharacterOverviewAll';
import { CharacterOverview } from '../character/CharacterOverview';
import { CharacterNoteEditor } from '../character/CharacterNoteEditor';
import { PlotOverview } from '../plot/PlotOverview';
import { EpisodeListScreen } from '../episode/EpisodeListScreen';
import { EpisodeEditScreen } from '../episode/EpisodeEditScreen';
import { ForeshadowListScreen } from '../foreshadow/ForeshadowListScreen';
import { ForeshadowEditScreen } from '../foreshadow/ForeshadowEditScreen';
import { IdeaArchiveListScreen } from '../idea-archive/IdeaArchiveListScreen';
import { IdeaArchiveEditScreen } from '../idea-archive/IdeaArchiveEditScreen';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { useSyncResolver } from '../../hooks/useSyncResolver';
import { usePersistentState } from '../../hooks/usePersistentState';
import { SyncDecisionDialog } from './SyncDecisionDialog';
import { Activity, WorkspaceSection } from '../../types/workspace';

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
  const [activity, setActivity] = useState<Activity>('home');
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<WorkspaceSection | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
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

  const resizeSidebar = (delta: number) =>
    setSidebarWidth((w) => clamp(w + delta, SIDEBAR_MIN, SIDEBAR_MAX));
  const resizeRightPanels = (delta: number) =>
    setRightPanelsWidth((w) => clamp(w + delta, RIGHT_PANEL_MIN, RIGHT_PANEL_MAX));

  const handleActivityChange = (next: Activity) => {
    // 접힌 상태에서 아이콘 클릭 → 자동 펼침 (VSCode 동작)
    if (sidebarCollapsed) setSidebarCollapsed(false);
    setActivity(next);
    setSelectedItemId(null);
    if (next === 'home') {
      // home 으로 전환 시 섹션만 초기화 — 선택된 작품은 보존
      setSelectedSection(null);
    } else {
      setSelectedSection(next);
    }
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

  return (
    <>
      <AppShell
        activityBar={
          <ActivityBar
            activity={activity}
            onActivityChange={handleActivityChange}
            workSelected={selectedWorkId !== null}
          />
        }
        sidebar={
          sidebarCollapsed ? null : (
            <SecondarySidebar
              activity={activity}
              selectedWorkId={selectedWorkId}
              selectedItemId={selectedItemId}
              onWorkSelect={handleWorkSelect}
              onItemSelect={setSelectedItemId}
              onNewWork={handleNewWorkReset}
              onNewWorldNote={(parentId?: string | null) => void handleNewWorldNote(parentId)}
              onNewPlanNote={() => void handleNewPlanNote()}
              width={sidebarWidth}
              onWidthChange={resizeSidebar}
              onCollapse={() => setSidebarCollapsed(true)}
            />
          )
        }
        rightPanels={
          <RightPanels width={rightPanelsWidth} onWidthChange={resizeRightPanels} />
        }
      >
        {renderMain({
          workId: selectedWorkId,
          section: selectedSection,
          itemId: selectedItemId,
          onCreateWork: handleNewWork,
          onSectionSelect: handleSectionSelect,
          onItemSelect: setSelectedItemId,
          onWorkDeleted: handleWorkDeleted,
        })}
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
  workId: string | null;
  section: WorkspaceSection | null;
  itemId: string | null;
  onCreateWork: (title: string) => Promise<void>;
  onSectionSelect: (section: WorkspaceSection) => void;
  onItemSelect: (id: string | null) => void;
  onWorkDeleted: () => void;
}

function renderMain({
  workId,
  section,
  itemId,
  onCreateWork,
  onSectionSelect,
  onItemSelect,
  onWorkDeleted,
}: RenderMainArgs) {
  if (!workId) {
    return <WorkspaceScreen onCreateWork={onCreateWork} />;
  }
  if (!section) {
    return (
      <WorkspaceHomeScreen
        workId={workId}
        onSectionSelect={onSectionSelect}
        onDeleted={onWorkDeleted}
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
      return <PlotOverview workId={workId} />;
    case 'episode':
      return itemId ? (
        <EpisodeEditScreen key={itemId} id={itemId} onBack={back} />
      ) : (
        <EpisodeListScreen workId={workId} onSelect={onItemSelect} />
      );
    case 'foreshadow':
      return itemId ? (
        <ForeshadowEditScreen key={itemId} id={itemId} onBack={back} />
      ) : (
        <ForeshadowListScreen workId={workId} onSelect={onItemSelect} />
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
