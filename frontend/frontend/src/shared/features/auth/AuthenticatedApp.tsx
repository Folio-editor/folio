import { useState } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { Sidebar } from '../../components/layout/Sidebar';
import { RightPanels } from '../../components/layout/RightPanels';
import { WorkspaceScreen } from '../workspace/WorkspaceScreen';
import { WorldNoteScreen } from '../worldnote/WorldNoteScreen';
import { useLocalWrite } from '../../hooks/useLocalWrite';

/**
 * 메인 에디터 화면.
 * - 상태: 선택된 작품 ID, 선택된 세계관 문서 ID
 * - AppShell (3패널) 안에 Sidebar / 중앙 콘텐츠 / RightPanels 조합
 */
export function AuthenticatedApp() {
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  const { createWork, createWorldNote } = useLocalWrite();

  const handleNewWork = async (title: string) => {
    const id = await createWork(title);
    setSelectedWorkId(id);
    setSelectedNoteId(null);
  };

  const handleNewNote = async () => {
    if (!selectedWorkId) return;
    const name = '새 문서';
    const id = await createWorldNote(selectedWorkId, name, Date.now());
    setSelectedNoteId(id);
  };

  const handleWorkSelect = (id: string) => {
    setSelectedWorkId(id);
    setSelectedNoteId(null);
  };

  const handleNoteSelect = (id: string) => {
    setSelectedNoteId(id);
  };

  return (
    <AppShell
      sidebar={
        <Sidebar
          selectedWorkId={selectedWorkId}
          selectedNoteId={selectedNoteId}
          onWorkSelect={handleWorkSelect}
          onNoteSelect={handleNoteSelect}
          onNewWork={() => {
            // WorkspaceScreen의 입력 UI로 작품 생성을 위임
            // 작품이 없거나 선택 해제 시 WorkspaceScreen이 표시됨
            setSelectedWorkId(null);
            setSelectedNoteId(null);
          }}
          onNewNote={() => void handleNewNote()}
        />
      }
      rightPanels={<RightPanels />}
    >
      {selectedNoteId ? (
        <WorldNoteScreen noteId={selectedNoteId} />
      ) : (
        <WorkspaceScreen onCreateWork={handleNewWork} />
      )}
    </AppShell>
  );
}
