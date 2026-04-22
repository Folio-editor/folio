import { useState } from 'react';
import { useQuery } from '@powersync/react';
import { Home, Plus } from 'lucide-react';
import { useWriterId } from '../../hooks/useWriterId';
import { Button } from '../../components/ui/Button';
import { MainPanelHeader } from '../../components/layout/MainPanelHeader';
import { cn } from '../../lib/cn';

interface WorkspaceHomeOverviewProps {
  onSelectWork: (id: string) => void;
  onCreateWork: (title: string) => Promise<void>;
}

interface WorkRow {
  id: string;
  title: string;
  author_name: string | null;
  description: string | null;
  status: string;
  updated_at: string;
}

const STATUS_COLOR: Record<string, string> = {
  연재중: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  완결: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  휴재: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
};

export function WorkspaceHomeOverview({ onSelectWork, onCreateWork }: WorkspaceHomeOverviewProps) {
  const writerId = useWriterId();
  const [showInput, setShowInput] = useState(false);
  const [title, setTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const { data: works = [] } = useQuery<WorkRow>(
    `SELECT id, title, author_name, description, status, updated_at
     FROM work
     WHERE writer_id = ? AND status != 'trashed'
     ORDER BY sort_order ASC, created_at ASC`,
    [writerId],
  );

  const handleCreate = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setIsCreating(true);
    try {
      await onCreateWork(trimmed);
      setTitle('');
      setShowInput(false);
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void handleCreate();
    if (e.key === 'Escape') {
      setShowInput(false);
      setTitle('');
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MainPanelHeader
        title={<h2 className="text-lg font-semibold">홈</h2>}
        subtitle="워크스페이스를 관리하고 정보를 편집합니다"
        trailing={
          <div className="flex items-center gap-2">
            {works.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {works.length}작품
              </span>
            )}
            <Button size="sm" onClick={() => setShowInput(true)}>
              <Plus className="h-4 w-4" />새 작품
            </Button>
          </div>
        }
      />

      {/* 인라인 작품 생성 입력 */}
      {showInput && (
        <div className="shrink-0 border-b border-border px-6 py-3">
          <div className="flex gap-2">
            <input
              autoFocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="작품 제목을 입력하세요"
              className="flex-1 rounded-lg border border-input px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            />
            <Button size="sm" onClick={() => void handleCreate()} disabled={!title.trim() || isCreating}>
              {isCreating ? '생성 중…' : '만들기'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setShowInput(false); setTitle(''); }}
            >
              취소
            </Button>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {works.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Home className="mb-4 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm font-medium text-muted-foreground">
              아직 작품이 없습니다
            </p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              새 작품을 만들어 집필을 시작하세요
            </p>
            {!showInput && (
              <button
                type="button"
                onClick={() => setShowInput(true)}
                className="mt-6 rounded-lg border-2 border-dashed border-input px-8 py-4 text-sm font-medium text-muted-foreground hover:border-ring hover:text-primary"
              >
                + 새 작품 만들기
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {works.map((work) => (
              <WorkWideCard key={work.id} work={work} onClick={() => onSelectWork(work.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── 넓은 작품 카드 ──
 * ┌──────────────────────────────────────────────┐
 * │  워크스페이스 이름                  [연재 상태] │
 * │                                              │
 * │  작품 소개.....                      작가명   │
 * │                                              │
 * │                                   수정 날짜   │
 * └──────────────────────────────────────────────┘
 */

function WorkWideCard({ work, onClick }: { work: WorkRow; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col rounded-lg border border-border bg-card p-5 text-left transition-colors hover:border-ring hover:bg-primary/5"
    >
      {/* 상단: 제목 + 상태 배지 */}
      <div className="flex items-start justify-between gap-4">
        <span className="text-base font-semibold text-foreground">
          {work.title?.trim() || '(제목 없음)'}
        </span>
        <span
          className={cn(
            'shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium',
            STATUS_COLOR[work.status] ?? 'bg-gray-100 dark:bg-gray-800',
          )}
        >
          {work.status}
        </span>
      </div>

      {/* 중단: 소개 + 작가명 */}
      <div className="mt-3 flex items-start justify-between gap-4">
        <p className="line-clamp-2 flex-1 text-sm text-muted-foreground">
          {work.description || '소개 없음'}
        </p>
        {work.author_name && (
          <span className="shrink-0 text-sm text-muted-foreground">
            {work.author_name}
          </span>
        )}
      </div>

      {/* 하단: 수정일 */}
      {work.updated_at && (
        <span className="mt-3 self-end text-xs text-muted-foreground">
          {formatDate(work.updated_at)}
        </span>
      )}
    </button>
  );
}

/* ── 유틸 ── */

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}
