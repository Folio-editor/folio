import { useState } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { ActivityBar } from '../../components/layout/ActivityBar';
import { SecondarySidebar } from '../../components/layout/SecondarySidebar';
import { RightPanels } from '../../components/layout/RightPanels';
import { WorkspaceScreen } from '../workspace/WorkspaceScreen';
import { WorkspaceHomeScreen } from '../workspace/WorkspaceHomeScreen';
import { PlanSectionShell } from '../plan/PlanSectionShell';
import { WorldNoteScreen } from '../world-note/WorldNoteScreen';
import { CharacterListScreen } from '../character/CharacterListScreen';
import { CharacterEditScreen } from '../character/CharacterEditScreen';
import { PlotListScreen } from '../plot/PlotListScreen';
import { PlotEditScreen } from '../plot/PlotEditScreen';
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
  const [selectedCharacterNoteId, setSelectedCharacterNoteId] = useState<string | undefined>(undefined);
  const resolver = useSyncResolver();

  const { createWork, createWorldNote, createPlanNote, createCharacterNote } = useLocalWrite();

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
    setSelectedCharacterNoteId(undefined);
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

  const handleNewWorldNote = async () => {
    if (!selectedWorkId) return;
    const id = await createWorldNote(selectedWorkId, '새 문서', Date.now());
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
    setSelectedCharacterNoteId(undefined);
    setSidebarCollapsed(false);
    setActivity('home');
  };

  const handleNewCharacterNote = async () => {
    if (!selectedItemId) return;
    const id = await createCharacterNote(selectedItemId, '새 문서', Date.now());
    setSelectedCharacterNoteId(id);
  };

  const handleCharacterNoteSelect = (id: string | null) => {
    setSelectedCharacterNoteId(id ?? undefined);
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
              onNewWorldNote={() => void handleNewWorldNote()}
              onNewPlanNote={() => void handleNewPlanNote()}
              selectedCharacterNoteId={selectedCharacterNoteId ?? null}
              onCharacterNoteSelect={handleCharacterNoteSelect}
              onNewCharacterNote={() => void handleNewCharacterNote()}
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
          selectedCharacterNoteId: selectedCharacterNoteId ?? null,
          setSelectedCharacterNoteId,
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
  selectedCharacterNoteId: string | null;
  setSelectedCharacterNoteId: (id: string | undefined) => void;
}

function renderMain({
  workId,
  section,
  itemId,
  onCreateWork,
  onSectionSelect,
  onItemSelect,
  onWorkDeleted,
  selectedCharacterNoteId,
  setSelectedCharacterNoteId,
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
        <WorldNoteScreen noteId={itemId} />
      ) : (
        <EmptyDetail message="좌측 사이드바에서 세계관 문서를 선택하거나 새로 추가하세요." />
      );
    case 'character':
      if (!itemId) return <CharacterListScreen workId={workId} onSelect={onItemSelect} />;
      return (
        <CharacterEditScreen
          id={itemId}
          noteId={selectedCharacterNoteId ?? null}
          onBack={() => { setSelectedCharacterNoteId(undefined); back(); }}
          onNoteBack={() => setSelectedCharacterNoteId(undefined)}
          onNoteSelect={(noteId) => setSelectedCharacterNoteId(noteId)}
        />
      );
    case 'plot':
      return itemId ? (
        <PlotEditScreen id={itemId} onBack={back} />
      ) : (
        <PlotListScreen workId={workId} onSelect={onItemSelect} />
      );
    case 'episode':
      return itemId ? (
        <EpisodeEditScreen id={itemId} onBack={back} />
      ) : (
        <EpisodeListScreen workId={workId} onSelect={onItemSelect} />
      );
    case 'foreshadow':
      return itemId ? (
        <ForeshadowEditScreen id={itemId} onBack={back} />
      ) : (
        <ForeshadowListScreen workId={workId} onSelect={onItemSelect} />
      );
    case 'idea-archive':
      return itemId ? (
        <IdeaArchiveEditScreen id={itemId} onBack={back} />
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
