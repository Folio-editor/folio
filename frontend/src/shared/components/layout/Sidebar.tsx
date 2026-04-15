import { useState } from 'react';
import { useQuery } from '@powersync/react';
import { useWriterId, useIsGuest } from '../../hooks/useWriterId';
import { useAuthStore } from '../../stores/authStore';

interface SidebarProps {
  selectedWorkId: string | null;
  selectedNoteId: string | null;
  onWorkSelect: (id: string) => void;
  onNoteSelect: (id: string) => void;
  onNewWork: () => void;
  onNewNote: () => void;
}

interface WorkRow {
  id: string;
  title: string;
}

interface NoteRow {
  id: string;
  name: string;
}

/**
 * 좌측 사이드바.
 * - 작품 목록 (useQuery — PowerSync 실시간 반응)
 * - 선택된 작품의 세계관 문서 목록
 * - 하단 프로필 버튼
 */
export function Sidebar({
  selectedWorkId,
  selectedNoteId,
  onWorkSelect,
  onNoteSelect,
  onNewWork,
  onNewNote,
}: SidebarProps) {
  const writerId = useWriterId();
  const isGuest = useIsGuest();
  const writer = useAuthStore((s) => s.writer);
  const login = useAuthStore((s) => s.login);
  const isLoggingIn = useAuthStore((s) => s.isLoggingIn);

  const [expandedWorkId, setExpandedWorkId] = useState<string | null>(selectedWorkId);

  const { data: works = [] } = useQuery<WorkRow>(
    `SELECT id, title FROM work WHERE writer_id = ? ORDER BY sort_order ASC, created_at ASC`,
    [writerId],
  );

  const { data: notes = [] } = useQuery<NoteRow>(
    `SELECT id, name FROM world_note
     WHERE work_id = ? AND writer_id = ? AND parent_id IS NULL
     ORDER BY sort_order ASC, created_at ASC`,
    [expandedWorkId ?? '', writerId],
  );

  const handleWorkClick = (workId: string) => {
    const next = expandedWorkId === workId ? null : workId;
    setExpandedWorkId(next);
    if (next) onWorkSelect(next);
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

      {/* 작품 & 문서 트리 */}
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {works.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-gray-400">
            작품이 없습니다.
            <br />위의 + 새 작품을 눌러 시작하세요.
          </p>
        )}

        {works.map((work) => {
          const isExpanded = expandedWorkId === work.id;
          return (
            <div key={work.id}>
              <button
                type="button"
                onClick={() => handleWorkClick(work.id)}
                className={`flex w-full items-center gap-1.5 px-3 py-1.5 text-left hover:bg-gray-100 ${
                  selectedWorkId === work.id ? 'bg-gray-100 font-medium text-gray-900' : 'text-gray-700'
                }`}
              >
                <span className="text-xs text-gray-400">{isExpanded ? '▾' : '▸'}</span>
                <span className="truncate">{work.title}</span>
              </button>

              {isExpanded && (
                <div className="pb-1">
                  {notes.map((note) => (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => onNoteSelect(note.id)}
                      className={`flex w-full items-center gap-1.5 py-1 pl-8 pr-3 text-left hover:bg-gray-100 ${
                        selectedNoteId === note.id
                          ? 'bg-blue-50 font-medium text-blue-700'
                          : 'text-gray-600'
                      }`}
                    >
                      <span className="text-xs text-gray-300">└</span>
                      <span className="truncate">{note.name}</span>
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={onNewNote}
                    className="flex w-full items-center gap-1.5 py-1 pl-8 pr-3 text-left text-gray-400 hover:text-gray-600"
                  >
                    <span className="text-xs">+</span>
                    <span className="text-xs">새 세계관 문서</span>
                  </button>
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
            onClick={() => void login()}
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
