import { useState } from 'react';
import { useQuery } from '@powersync/react';
import { Trash2 } from 'lucide-react';
import { useWriterId } from '../../hooks/useWriterId';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { useDeferredText } from '../../hooks/useDeferredText';
import { Select } from '../../components/ui/Select';
import { Textarea } from '../../components/ui/Textarea';
import { Button } from '../../components/ui/Button';
import { SECTION_ICONS, SECTION_LABELS, WorkspaceSection } from '../../types/workspace';

interface WorkspaceHomeScreenProps {
  workId: string;
  onSectionSelect: (section: WorkspaceSection) => void;
  onDeleted: () => void;
}

interface WorkRow {
  id: string;
  title: string;
  author_name: string | null;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
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

const SECTION_DESCRIPTIONS: Record<WorkspaceSection, string> = {
  plan: '작품의 방향성·슬로건·장르·타겟 정의',
  'world-note': '시대·공간·세력·규칙 등 설정 자료',
  character: '캐릭터 프로필과 성격',
  plot: '줄거리 구조와 회차 설계',
  episode: '실제 본문 집필',
  foreshadow: '복선 설정과 회수 추적',
  'idea-archive': '영감과 좋은 문장 모음',
};

const STATUS_OPTIONS = [
  { value: '연재중', label: '연재중' },
  { value: '완결', label: '완결' },
  { value: '휴재', label: '휴재' },
];

const STATUS_COLOR: Record<string, string> = {
  연재중: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  완결: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  휴재: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
};

/**
 * 작품 허브 — ERD work 테이블 전 필드를 즉시 편집 가능한 에디터 형태로 제공.
 * - title / author_name / description: useDeferredText + onBlur commit
 * - status: select 즉시 commit
 * - 하단: 7개 섹션 카드 (기존 네비게이션 유지)
 * - 우측 상단: 삭제 버튼 (confirm 다이얼로그)
 */
export function WorkspaceHomeScreen({
  workId,
  onSectionSelect,
  onDeleted,
}: WorkspaceHomeScreenProps) {
  const writerId = useWriterId();
  const { data: works = [] } = useQuery<WorkRow>(
    `SELECT id, title, author_name, description, status, created_at, updated_at
     FROM work WHERE id = ? AND writer_id = ?`,
    [workId, writerId],
  );
  const work = works[0];

  if (!work) {
    return <div className="p-8 text-sm text-muted-foreground">작품을 불러오는 중…</div>;
  }

  return (
    <WorkspaceEditor
      key={workId}
      work={work}
      onSectionSelect={onSectionSelect}
      onDeleted={onDeleted}
    />
  );
}

interface WorkspaceEditorProps {
  work: WorkRow;
  onSectionSelect: (section: WorkspaceSection) => void;
  onDeleted: () => void;
}

function WorkspaceEditor({ work, onSectionSelect, onDeleted }: WorkspaceEditorProps) {
  const { updateWork, deleteWork } = useLocalWrite();
  const { id } = work;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const title = useDeferredText(id, work.title, (v) => {
    const trimmed = v.trim();
    if (!trimmed) return; // 빈 제목 방지 (NOT NULL)
    void updateWork(id, { title: trimmed });
  });
  const authorName = useDeferredText(id, work.author_name ?? '', (v) => {
    void updateWork(id, { author_name: v || null });
  });
  const description = useDeferredText(id, work.description ?? '', (v) => {
    void updateWork(id, { description: v || null });
  });

  const handleStatusChange = (next: string) => {
    if (next === work.status) return;
    void updateWork(id, { status: next });
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteWork(id);
      setConfirmOpen(false);
      onDeleted();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* 작품 메타데이터 에디터 */}
      <section className="border-b border-border px-10 pb-6 pt-8">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex-1">
            <input
              value={title.value}
              onChange={(e) => title.onChange(e.target.value)}
              onBlur={title.onBlur}
              placeholder="작품 제목"
              maxLength={200}
              className="w-full border-0 bg-transparent px-0 py-1 text-2xl font-bold text-foreground placeholder-muted-foreground/50 outline-none focus:ring-0"
            />
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">작가</span>
              <input
                value={authorName.value}
                onChange={(e) => authorName.onChange(e.target.value)}
                onBlur={authorName.onBlur}
                placeholder="작가명을 입력하세요"
                maxLength={100}
                className="flex-1 border-0 bg-transparent px-0 py-0 text-sm text-foreground placeholder-muted-foreground/50 outline-none focus:ring-0"
              />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Select
              options={STATUS_OPTIONS}
              value={
                STATUS_OPTIONS.some((o) => o.value === work.status)
                  ? work.status
                  : '연재중'
              }
              onChange={(e) => handleStatusChange(e.target.value)}
              className={`w-28 font-medium ${STATUS_COLOR[work.status] ?? ''}`}
              aria-label="연재 상태"
            />
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              aria-label="작품 삭제"
              title="작품 삭제"
              className="rounded p-2 text-muted-foreground hover:bg-destructive/5 hover:text-destructive"
            >
              <Trash2 size={16} strokeWidth={1.75} />
            </button>
          </div>
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            작품 소개
          </label>
          <Textarea
            rows={3}
            value={description.value}
            onChange={(e) => description.onChange(e.target.value)}
            onBlur={description.onBlur}
            placeholder="한 줄 소개나 줄거리를 자유롭게 작성하세요."
          />
        </div>

        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>생성 {formatDate(work.created_at)}</span>
          <span>최근 수정 {formatDate(work.updated_at)}</span>
        </div>
      </section>

      {/* 섹션 네비게이션 */}
      <section className="px-10 py-6">
        <h2 className="mb-3 text-sm font-semibold text-foreground">바로가기</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {SECTIONS.map((section) => (
            <button
              key={section}
              type="button"
              onClick={() => onSectionSelect(section)}
              className="flex flex-col items-start rounded-lg border border-border bg-background p-4 text-left transition-colors hover:border-ring hover:bg-primary/5"
            >
              <span className="text-2xl">{SECTION_ICONS[section]}</span>
              <span className="mt-2 text-sm font-medium text-foreground">
                {SECTION_LABELS[section]}
              </span>
              <span className="mt-1 text-xs text-muted-foreground">
                {SECTION_DESCRIPTIONS[section]}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* 삭제 확인 다이얼로그 */}
      {confirmOpen && (
        <DeleteConfirmDialog
          title={work.title}
          busy={deleting}
          onConfirm={() => void handleDelete()}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}

interface DeleteConfirmDialogProps {
  title: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirmDialog({ title, busy, onConfirm, onCancel }: DeleteConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-lg bg-background p-5 shadow-lg">
        <h3 className="text-base font-semibold text-foreground">휴지통으로 이동</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">&ldquo;{title}&rdquo;</span> 이(가)
          휴지통으로 이동됩니다.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          30일 후 자동으로 영구 삭제됩니다. 휴지통에서 복원할 수 있습니다.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            취소
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={busy}>
            {busy ? '이동 중…' : '휴지통으로 이동'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
