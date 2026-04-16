import { useState } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { Sidebar } from '../../components/layout/Sidebar';
import { RightPanels } from '../../components/layout/RightPanels';
import { WorkspaceScreen } from '../workspace/WorkspaceScreen';
import { WorkspaceHomeScreen } from '../workspace/WorkspaceHomeScreen';
import { PlanScreen } from '../plan/PlanScreen';
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
import { SyncDecisionDialog } from './SyncDecisionDialog';
import { WorkspaceSection } from '../../types/workspace';

/**
 * 메인 에디터 화면.
 * 상태는 셋: selectedWorkId / selectedSection / selectedItemId.
 * useSyncResolver는 로그인 직후 sync 의사결정을 자동/수동으로 처리한다.
 */
export function AuthenticatedApp() {
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<WorkspaceSection | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const resolver = useSyncResolver();

  const { createWork, createWorldNote } = useLocalWrite();

  const handleNewWork = async (title: string) => {
    const id = await createWork(title);
    setSelectedWorkId(id);
    setSelectedSection(null);
    setSelectedItemId(null);
  };

  const handleNewWorldNote = async () => {
    if (!selectedWorkId) return;
    const id = await createWorldNote(selectedWorkId, '새 문서', Date.now());
    setSelectedSection('world-note');
    setSelectedItemId(id);
  };

  return (
    <>
      <AppShell
        sidebar={
          <Sidebar
            selectedWorkId={selectedWorkId}
            selectedSection={selectedSection}
            selectedItemId={selectedItemId}
            onWorkSelect={(id) => {
              setSelectedWorkId(id);
              setSelectedSection(null);
              setSelectedItemId(null);
            }}
            onSectionSelect={(section) => {
              setSelectedSection(section);
              setSelectedItemId(null);
            }}
            onItemSelect={(id) => setSelectedItemId(id)}
            onNewWork={() => {
              setSelectedWorkId(null);
              setSelectedSection(null);
              setSelectedItemId(null);
            }}
            onNewWorldNote={() => void handleNewWorldNote()}
          />
        }
        rightPanels={<RightPanels />}
      >
        {renderMain({
          workId: selectedWorkId,
          section: selectedSection,
          itemId: selectedItemId,
          onCreateWork: handleNewWork,
          onSectionSelect: setSelectedSection,
          onItemSelect: setSelectedItemId,
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
}

function renderMain({
  workId,
  section,
  itemId,
  onCreateWork,
  onSectionSelect,
  onItemSelect,
}: RenderMainArgs) {
  if (!workId) {
    return <WorkspaceScreen onCreateWork={onCreateWork} />;
  }
  if (!section) {
    return <WorkspaceHomeScreen workId={workId} onSectionSelect={onSectionSelect} />;
  }

  const back = () => onItemSelect(null);

  switch (section) {
    case 'plan':
      return <PlanScreen workId={workId} />;
    case 'world-note':
      return itemId ? (
        <WorldNoteScreen noteId={itemId} />
      ) : (
        <EmptyDetail message="좌측 사이드바에서 세계관 문서를 선택하거나 새로 추가하세요." />
      );
    case 'character':
      return itemId ? (
        <CharacterEditScreen id={itemId} onBack={back} />
      ) : (
        <CharacterListScreen workId={workId} onSelect={onItemSelect} />
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
    <div className="flex h-full items-center justify-center px-8 text-center text-sm text-gray-400">
      {message}
    </div>
  );
}
