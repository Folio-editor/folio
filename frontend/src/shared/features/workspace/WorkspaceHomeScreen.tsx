import { useEffect, useState } from 'react';
import { useQuery } from '@powersync/react';
import { useDecryptedWork } from '../../hooks/useDecryptedWork';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeft,
  BookOpenText,
  ClipboardList,
  Globe,
  KeyRound,
  Lightbulb,
  Plus,
  Route,
  Trash2,
  Users,
} from 'lucide-react';
import { useWriterId } from '../../hooks/useWriterId';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { useDeferredText } from '../../hooks/useDeferredText';
import { Button } from '../../components/ui/Button';
import { TagEditModal } from '../../components/ui/TagEditModal';
import {
  StatusPillDropdown,
  type StatusPillOption,
} from '../../components/ui/StatusPillDropdown';
import { MainPanelHeader } from '../../components/layout/MainPanelHeader';
import { SECTION_LABELS, WorkspaceSection } from '../../types/workspace';
import { cn } from '../../lib/cn';
import { parseServerDate } from '../../lib/dateTime';

interface WorkspaceHomeScreenProps {
  workId: string;
  onSectionSelect: (section: WorkspaceSection) => void;
  onDeleted: () => void;
  onBack: () => void;
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

// 아이디어는 좌측 사이드바 영역을 갖지 않고 우측 패널 전용이므로
// 작품 허브 카드 그리드에서 제외 — 'idea-archive' 진입은 ActivityBar 퀵 점프로 처리.
const SECTIONS: WorkspaceSection[] = [
  'plan',
  'world-note',
  'character',
  'plot',
  'episode',
  'foreshadow',
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

const STATUS_OPTIONS: StatusPillOption[] = [
  { value: '연재중', label: '연재중', tone: 'blue' },
  { value: '완결', label: '완결', tone: 'emerald' },
  { value: '휴재', label: '휴재', tone: 'amber' },
];

const SECTION_ICON: Record<WorkspaceSection, LucideIcon> = {
  plan: ClipboardList,
  'world-note': Globe,
  character: Users,
  plot: Route,
  episode: BookOpenText,
  foreshadow: KeyRound,
  'idea-archive': Lightbulb,
};

/**
 * 작품 허브 — ERD work 테이블 전 필드를 즉시 편집 가능한 에디터 형태로 제공.
 * - title / author_name / description: useDeferredText + onBlur commit
 * - status: select 즉시 commit
 * - 하단: 6개 섹션 카드 (아이디어는 우측 패널 전용이라 제외)
 * - 우측 상단: 삭제 버튼 (confirm 다이얼로그)
 */
export function WorkspaceHomeScreen({
  workId,
  onSectionSelect,
  onDeleted,
  onBack,
}: WorkspaceHomeScreenProps) {
  const writerId = useWriterId();
  // writer_id 검증은 별도 쿼리로 (useDecryptedWork는 id만으로 조회).
  const { data: ownership = [] } = useQuery<{ id: string }>(
    `SELECT id FROM work WHERE id = ? AND writer_id = ?`,
    [workId, writerId],
  );
  const { data: decrypted } = useDecryptedWork(workId);

  if (ownership.length === 0 || !decrypted) {
    return <div className="p-8 text-sm text-muted-foreground">작품을 불러오는 중…</div>;
  }

  const work: WorkRow = {
    id: decrypted.id,
    title: decrypted.title,
    author_name: decrypted.author_name,
    description: decrypted.description,
    status: decrypted.status,
    created_at: decrypted.created_at,
    updated_at: decrypted.updated_at,
  };

  return (
    <WorkspaceEditor
      key={workId}
      work={work}
      onSectionSelect={onSectionSelect}
      onDeleted={onDeleted}
      onBack={onBack}
    />
  );
}

interface WorkspaceEditorProps {
  work: WorkRow;
  onSectionSelect: (section: WorkspaceSection) => void;
  onDeleted: () => void;
  onBack: () => void;
}

function WorkspaceEditor({ work, onSectionSelect, onDeleted, onBack }: WorkspaceEditorProps) {
  const { updateWork, deleteWork, ensurePlan, updatePlan } = useLocalWrite();
  const { id } = work;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [tagModal, setTagModal] = useState<TagField | null>(null);

  // 작품 단위 태그(장르·분위기)는 plan 테이블에 그대로 둔다 (서비스 보류 결정).
  // 작품 허브에서는 plan 행을 직접 읽고 쓰는 형태로 노출.
  // plan 행이 없으면 태그 첫 편집 시점에 ensurePlan 으로 생성.
  const [planId, setPlanId] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    void ensurePlan(id).then((pid) => {
      if (mounted) setPlanId(pid);
    });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const { data: planRows = [] } = useQuery<{ id: string; genres: string | null; moods: string | null }>(
    `SELECT id, genres, moods FROM plan WHERE work_id = ? LIMIT 1`,
    [id],
  );
  const planRow = planRows[0];
  const genres = parseTags(planRow?.genres ?? null);
  const moods = parseTags(planRow?.moods ?? null);

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

  const handleTagsApply = (field: TagField) => (next: string[]) => {
    if (!planId) return;
    void updatePlan(planId, {
      [field]: next.length > 0 ? JSON.stringify(next) : null,
    });
  };

  const removeTag = (field: TagField, idx: number) => {
    if (!planId) return;
    const current = field === 'genres' ? genres : moods;
    const next = current.filter((_, i) => i !== idx);
    void updatePlan(planId, {
      [field]: next.length > 0 ? JSON.stringify(next) : null,
    });
  };

  return (
    <div className="flex h-full flex-col">
      <MainPanelHeader
        leading={
          <button
            type="button"
            onClick={onBack}
            aria-label="작품 목록으로 돌아가기"
            title="작품 목록으로 돌아가기"
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <ArrowLeft size={14} strokeWidth={2} />
          </button>
        }
        title={<span className="text-lg font-semibold">홈</span>}
        subtitle={work.title?.trim() || '작품 허브'}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-10 py-8">
        {/* 작품 메타데이터 에디터 */}
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
          <div className="flex shrink-0 flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <StatusPillDropdown
                value={STATUS_OPTIONS.some((o) => o.value === work.status) ? work.status : '연재중'}
                options={STATUS_OPTIONS}
                onChange={handleStatusChange}
                ariaLabel="연재 상태"
                width={112}
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
            <div className="flex flex-col items-end gap-0.5 text-xs text-muted-foreground">
              <span>생성 {formatDate(work.created_at)}</span>
              <span>수정 {formatDate(work.updated_at)}</span>
            </div>
          </div>
        </div>

        {/* 장르 + 분위기 태그 */}
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TagSection
            label="장르"
            tags={genres}
            disabled={!planId}
            onAddClick={() => setTagModal('genres')}
            onRemove={(idx) => removeTag('genres', idx)}
          />
          <TagSection
            label="분위기"
            tags={moods}
            disabled={!planId}
            onAddClick={() => setTagModal('moods')}
            onRemove={(idx) => removeTag('moods', idx)}
          />
        </div>

        {/* 작품 소개 — 테두리 없이 자연스럽게 */}
        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            작품 소개
          </label>
          <textarea
            value={description.value}
            onChange={(e) => {
              description.onChange(e.target.value);
              autoGrow(e.target);
            }}
            onBlur={description.onBlur}
            onFocus={(e) => autoGrow(e.target)}
            ref={(el) => { if (el) autoGrow(el); }}
            placeholder="한 줄 소개나 줄거리를 자유롭게 작성하세요."
            className="w-full resize-none overflow-hidden border-0 bg-transparent px-0 py-1 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-0"
          />
        </div>

        {/* 스페이서 — 바로가기 카드를 바닥 쪽으로 밀어냄 */}
        <div className="flex-1" />

        {/* 섹션 바로가기 */}
        <div className="grid grid-cols-2 gap-3 pb-4 sm:grid-cols-3">
          {SECTIONS.map((section) => {
            const Icon = SECTION_ICON[section];
            return (
              <button
                key={section}
                type="button"
                onClick={() => onSectionSelect(section)}
                className="flex flex-col items-start rounded-lg border border-border bg-background p-4 text-left transition-colors hover:border-ring hover:bg-primary/5"
              >
                <Icon size={24} strokeWidth={1.5} className="text-muted-foreground" />
                <span className="mt-2 text-sm font-medium text-foreground">
                  {SECTION_LABELS[section]}
                </span>
                <span className="mt-1 text-xs text-muted-foreground">
                  {SECTION_DESCRIPTIONS[section]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 삭제 확인 다이얼로그 */}
      {confirmOpen && (
        <DeleteConfirmDialog
          title={work.title}
          busy={deleting}
          onConfirm={() => void handleDelete()}
          onCancel={() => setConfirmOpen(false)}
        />
      )}

      {/* 태그 편집 모달 */}
      <TagEditModal
        open={tagModal === 'genres'}
        title="장르 편집"
        value={genres}
        onApply={handleTagsApply('genres')}
        onClose={() => setTagModal(null)}
        placeholder="판타지 입력 후 Enter"
      />
      <TagEditModal
        open={tagModal === 'moods'}
        title="분위기 편집"
        value={moods}
        onApply={handleTagsApply('moods')}
        onClose={() => setTagModal(null)}
        placeholder="다크 입력 후 Enter"
      />
    </div>
  );
}

type TagField = 'genres' | 'moods';

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((v) => typeof v === 'string');
  } catch {
    /* 손상 데이터 */
  }
  return [];
}

function TagSection({
  label,
  tags,
  disabled,
  onAddClick,
  onRemove,
}: {
  label: string;
  tags: string[];
  disabled: boolean;
  onAddClick: () => void;
  onRemove: (idx: number) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</label>
      <div className="flex items-center gap-1.5">
        <div className="flex min-h-7 flex-1 flex-wrap items-center gap-1.5">
          {tags.length > 0 ? (
            tags.map((tag, idx) => (
              <span
                key={`${label}-${idx}`}
                className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => onRemove(idx)}
                  className="rounded text-primary/70 hover:text-primary"
                  aria-label={`${tag} 제거`}
                >
                  ×
                </button>
              </span>
            ))
          ) : (
            <span className="text-xs text-muted-foreground/50">미설정</span>
          )}
        </div>
        <button
          type="button"
          onClick={onAddClick}
          disabled={disabled}
          aria-label={`${label} 추가`}
          title={`${label} 추가`}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
        >
          <Plus size={14} strokeWidth={2} />
        </button>
      </div>
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

function autoGrow(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

function formatDate(iso: string): string {
  const d = parseServerDate(iso);
  if (!d) return iso || '';
  return d.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
