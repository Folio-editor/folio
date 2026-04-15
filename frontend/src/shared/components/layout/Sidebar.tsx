import { useState } from 'react';
import { useQuery } from '@powersync/react';
import { useWriterId, useIsGuest } from '../../hooks/useWriterId';
import { useAuthStore } from '../../stores/authStore';
import {
  SECTION_ICONS,
  SECTION_LABELS,
  SECTION_TABLES,
  WorkspaceSection,
} from '../../types/workspace';
import { cn } from '../../lib/cn';

interface SidebarProps {
  selectedWorkId: string | null;
  selectedSection: WorkspaceSection | null;
  selectedItemId: string | null;
  onWorkSelect: (id: string) => void;
  onSectionSelect: (section: WorkspaceSection | null) => void;
  onItemSelect: (id: string | null) => void;
  onNewWork: () => void;
  onNewWorldNote: () => void;
}

interface WorkRow {
  id: string;
  title: string;
}

interface NoteRow {
  id: string;
  name: string;
}

interface CountRow {
  cnt: number;
}

const SECTIONS: WorkspaceSection[] = [
  'plan',
  'world-note',
  'character',
  'plot',
  'episode',
  'foreshadow',
  'idea-archive',
];

/**
 * 좌측 사이드바.
 * - 작품 목록 (PowerSync useQuery)
 * - 선택된 작품 하위에 7개 영역 카테고리 표시
 * - world-note 카테고리 펼침 시 하위 노트 평면 리스트
 * - 하단 프로필 / 로그인 버튼
 */
export function Sidebar({
  selectedWorkId,
  selectedSection,
  selectedItemId,
  onWorkSelect,
  onSectionSelect,
  onItemSelect,
  onNewWork,
  onNewWorldNote,
}: SidebarProps) {
  const writerId = useWriterId();
  const isGuest = useIsGuest();
  const writer = useAuthStore((s) => s.writer);
  const login = useAuthStore((s) => s.login);
  const isLoggingIn = useAuthStore((s) => s.isLoggingIn);

  const [expandedWorkId, setExpandedWorkId] = useState<string | null>(selectedWorkId);

  // 로그인 버튼 — OAuth만 트리거.
  // 게스트 데이터 처리 의사결정은 로그인 후 useSyncResolver가 SyncDecisionDialog로 처리.
  const handleLoginClick = () => void login();

  const { data: works = [] } = useQuery<WorkRow>(
    `SELECT id, title FROM work WHERE writer_id = ? ORDER BY sort_order ASC, created_at ASC`,
    [writerId],
  );

  const handleWorkClick = (workId: string) => {
    const next = expandedWorkId === workId ? null : workId;
    setExpandedWorkId(next);
    if (next) {
      onWorkSelect(next);
      onSectionSelect(null);
      onItemSelect(null);
    }
  };

  return (
    <div className="flex h-full flex-col text-sm">
      {/* 새 작품 버튼 */}
      <div className="border-b p-3">
        <button
          type="button"
          onClick={onNewWork}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-gray-600 hover:bg-gray-100"
        >
          <span className="text-base font-medium leading-none">+</span>
          <span>새 작품</span>
        </button>
      </div>

      {/* 작품 트리 */}
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {works.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-gray-400">
            작품이 없습니다.
            <br />위의 + 새 작품을 눌러 시작하세요.
          </p>
        )}

        {works.map((work) => {
          const isExpanded = expandedWorkId === work.id;
          const isSelected = selectedWorkId === work.id;
          return (
            <div key={work.id}>
              <button
                type="button"
                onClick={() => handleWorkClick(work.id)}
                className={cn(
                  'flex w-full items-center gap-1.5 px-3 py-1.5 text-left hover:bg-gray-100',
                  isSelected ? 'bg-gray-100 font-medium text-gray-900' : 'text-gray-700',
                )}
              >
                <span className="text-xs text-gray-400">{isExpanded ? '▾' : '▸'}</span>
                <span className="truncate">{work.title}</span>
              </button>

              {isExpanded && (
                <div className="pb-2">
                  {SECTIONS.map((section) => (
                    <SectionRow
                      key={section}
                      workId={work.id}
                      section={section}
                      selected={selectedWorkId === work.id && selectedSection === section}
                      selectedItemId={selectedItemId}
                      onSelect={() => {
                        onWorkSelect(work.id);
                        onSectionSelect(section);
                        onItemSelect(null);
                      }}
                      onItemSelect={onItemSelect}
                      onNewWorldNote={onNewWorldNote}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 하단 프로필 */}
      <div className="border-t p-3">
        {isGuest ? (
          <button
            type="button"
            onClick={() => void handleLoginClick()}
            disabled={isLoggingIn}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-gray-500 hover:bg-gray-100 disabled:opacity-50"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-xs">
              ○
            </span>
            <span className="text-xs">{isLoggingIn ? '로그인 중…' : '게스트 — 로그인'}</span>
          </button>
        ) : (
          <div className="flex items-center gap-2 px-2 py-1.5">
            {writer?.profileImageUrl ? (
              <img src={writer.profileImageUrl} alt="" className="h-6 w-6 rounded-full" />
            ) : (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs text-blue-600">
                ●
              </span>
            )}
            <span className="truncate text-xs text-gray-700">
              {writer?.nickname ?? writer?.email ?? ''}
            </span>
          </div>
        )}
      </div>

    </div>
  );
}

interface SectionRowProps {
  workId: string;
  section: WorkspaceSection;
  selected: boolean;
  selectedItemId: string | null;
  onSelect: () => void;
  onItemSelect: (id: string | null) => void;
  onNewWorldNote: () => void;
}

function SectionRow({
  workId,
  section,
  selected,
  selectedItemId,
  onSelect,
  onItemSelect,
  onNewWorldNote,
}: SectionRowProps) {
  const writerId = useWriterId();
  const table = SECTION_TABLES[section];

  // plan은 1:1이므로 카운트 표시 생략
  const showCount = section !== 'plan';
  const { data: countRows = [] } = useQuery<CountRow>(
    showCount
      ? `SELECT COUNT(*) AS cnt FROM ${table} WHERE work_id = ? AND writer_id = ?`
      : `SELECT 0 AS cnt`,
    showCount ? [workId, writerId] : [],
  );
  const count = countRows[0]?.cnt ?? 0;

  const isWorldNote = section === 'world-note';

  return (
    <div>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          'flex w-full items-center justify-between gap-1.5 py-1 pl-7 pr-3 text-left hover:bg-gray-100',
          selected ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-600',
        )}
      >
        <span className="flex items-center gap-1.5 truncate">
          <span className="text-xs">{SECTION_ICONS[section]}</span>
          <span className="truncate">{SECTION_LABELS[section]}</span>
        </span>
        {showCount && count > 0 && (
          <span className="text-[10px] text-gray-400">{count}</span>
        )}
      </button>

      {/* 세계관 펼침 시 노트 평면 리스트 */}
      {isWorldNote && selected && (
        <WorldNoteList
          workId={workId}
          selectedItemId={selectedItemId}
          onItemSelect={onItemSelect}
          onNewWorldNote={onNewWorldNote}
        />
      )}
    </div>
  );
}

interface WorldNoteListProps {
  workId: string;
  selectedItemId: string | null;
  onItemSelect: (id: string | null) => void;
  onNewWorldNote: () => void;
}

function WorldNoteList({ workId, selectedItemId, onItemSelect, onNewWorldNote }: WorldNoteListProps) {
  const writerId = useWriterId();
  const { data: notes = [] } = useQuery<NoteRow>(
    `SELECT id, name FROM world_note
     WHERE work_id = ? AND writer_id = ? AND parent_id IS NULL
     ORDER BY sort_order ASC, created_at ASC`,
    [workId, writerId],
  );

  return (
    <div className="pb-1">
      {notes.map((note) => (
        <button
          key={note.id}
          type="button"
          onClick={() => onItemSelect(note.id)}
          className={cn(
            'flex w-full items-center gap-1.5 py-1 pl-12 pr-3 text-left hover:bg-gray-100',
            selectedItemId === note.id
              ? 'bg-blue-100 font-medium text-blue-800'
              : 'text-gray-600',
          )}
        >
          <span className="text-xs text-gray-300">└</span>
          <span className="truncate">{note.name}</span>
        </button>
      ))}
      <button
        type="button"
        onClick={onNewWorldNote}
        className="flex w-full items-center gap-1.5 py-1 pl-12 pr-3 text-left text-gray-400 hover:text-gray-600"
      >
        <span className="text-xs">+</span>
        <span className="text-xs">새 세계관 문서</span>
      </button>
    </div>
  );
}
