import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@powersync/react';
import { generateHTML } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import { ChevronDown, Plus } from 'lucide-react';
import { useWriterId } from '../../hooks/useWriterId';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { useDeferredText } from '../../hooks/useDeferredText';
import { usePersistentState } from '../../hooks/usePersistentState';
import { ContentEditor } from '../../components/editor/ContentEditor';
import { ViewToggle } from '../../components/ui/ViewToggle';
import { cn } from '../../lib/cn';
import { PlanHeader } from './PlanHeader';
import { TagEditModal } from './TagEditModal';

const previewExtensions = [
  StarterKit.configure({ code: false, codeBlock: false }),
  Highlight.configure({ multicolor: false }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
];

interface PlanSectionShellProps {
  workId: string;
  selectedItemId: string | null;
  onItemSelect: (id: string) => void;
  onItemBack: () => void;
  onSendToRight?: () => void;
}

interface PlanMetaRow {
  id: string;
  slogan: string | null;
  genres: string | null;
  moods: string | null;
  target_audience: string | null;
}

interface PlanNoteRow {
  id: string;
  title: string;
  content: string | null;
}

interface NoteSummaryRow {
  id: string;
  title: string;
  content: string | null;
}

export function PlanSectionShell({
  workId,
  selectedItemId,
  onItemSelect,
  onItemBack,
  onSendToRight,
}: PlanSectionShellProps) {
  const writerId = useWriterId();
  const { ensurePlan, updatePlan, updatePlanNoteTitle, updatePlanNoteContent, deletePlanNote } =
    useLocalWrite();
  const [planId, setPlanId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void ensurePlan(workId).then((id) => {
      if (mounted) setPlanId(id);
    });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workId, writerId]);

  const { data: metaRows = [] } = useQuery<PlanMetaRow>(
    `SELECT id, slogan, genres, moods, target_audience
     FROM plan WHERE work_id = ? LIMIT 1`,
    [workId],
  );
  const meta = metaRows[0];

  const { data: noteRows = [] } = useQuery<PlanNoteRow>(
    selectedItemId
      ? `SELECT id, title, content FROM plan_note WHERE id = ? LIMIT 1`
      : `SELECT '' AS id, '' AS title, NULL AS content WHERE 0`,
    selectedItemId ? [selectedItemId] : [],
  );
  const note = selectedItemId ? (noteRows[0] ?? null) : null;

  if (!meta || !planId) {
    return <div className="p-8 text-sm text-muted-foreground">기획을 불러오는 중…</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PlanHeader
        currentNote={
          note
            ? {
                id: note.id,
                title: note.title,
                onTitleChange: (title) => void updatePlanNoteTitle(note.id, title),
                onDelete: () => deletePlanNote(note.id),
                onBack: onItemBack,
                onSendToRight,
              }
            : undefined
        }
      />

      <div className="flex min-h-0 flex-1 flex-col">
        {selectedItemId && note ? (
          <ContentEditor
            key={note.id}
            itemId={note.id}
            initialContent={note.content}
            placeholder="시놉시스, 레퍼런스, 메모를 자유롭게 작성하세요…"
            onUpdate={(content) => void updatePlanNoteContent(note.id, content)}
          />
        ) : selectedItemId && !note ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            문서를 불러오는 중…
          </div>
        ) : (
          <PlanOverview
            planId={planId}
            workId={workId}
            meta={meta}
            onMetaChange={(patch) => void updatePlan(meta.id, patch)}
            onNoteSelect={onItemSelect}
          />
        )}
      </div>
    </div>
  );
}

/* ── 기획 메인 화면: 메타데이터 편집 + 하위 문서 요약 ── */

type MetaPatch = Partial<{
  slogan: string | null;
  genres: string | null;
  moods: string | null;
  target_audience: string | null;
}>;

type TagField = 'genres' | 'moods';

function PlanOverview({
  planId,
  workId,
  meta,
  onMetaChange,
  onNoteSelect,
}: {
  planId: string;
  workId: string;
  meta: PlanMetaRow;
  onMetaChange: (patch: MetaPatch) => void;
  onNoteSelect: (id: string) => void;
}) {
  const genres = parseTags(meta.genres);
  const moods = parseTags(meta.moods);
  const [modal, setModal] = useState<TagField | null>(null);
  const [viewMode, setViewMode] = usePersistentState<'grid' | 'list'>('folio.ui.view-mode.plan', 'list');

  const sloganField = useDeferredText(planId, meta.slogan ?? '', (v) =>
    onMetaChange({ slogan: v || null }),
  );
  const targetField = useDeferredText(planId, meta.target_audience ?? '', (v) =>
    onMetaChange({ target_audience: v || null }),
  );

  const handleTagsApply = (field: TagField) => (next: string[]) => {
    onMetaChange({
      [field]: next.length > 0 ? JSON.stringify(next) : null,
    } as MetaPatch);
  };

  const removeTag = (field: TagField, idx: number) => {
    const current = field === 'genres' ? genres : moods;
    const next = current.filter((_, i) => i !== idx);
    onMetaChange({
      [field]: next.length > 0 ? JSON.stringify(next) : null,
    } as MetaPatch);
  };

  const { data: notes = [] } = useQuery<NoteSummaryRow>(
    `SELECT id, title, content FROM plan_note
     WHERE work_id = ?
     ORDER BY sort_order ASC, created_at ASC`,
    [workId],
  );

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      {/* 메타데이터 편집 카드 */}
      <div className="mb-6 rounded-lg border border-border bg-card p-5">
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          작품 메타데이터
        </h3>

        <div className="space-y-4">
          {/* 슬로건 */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">슬로건</label>
            <input
              type="text"
              value={sloganField.value}
              onChange={(e) => sloganField.onChange(e.target.value)}
              onBlur={sloganField.onBlur}
              placeholder="작품의 핵심을 한 줄로"
              className="w-full bg-transparent py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>

          {/* 타겟 독자 */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">타겟 독자</label>
            <input
              type="text"
              value={targetField.value}
              onChange={(e) => targetField.onChange(e.target.value)}
              onBlur={targetField.onBlur}
              placeholder="20·30대 여성, 정통 판타지 팬 등"
              className="w-full bg-transparent py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>

          {/* 장르 + 분위기 */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* 장르 */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">장르</label>
              <div className="flex items-center gap-1.5">
                <div className="flex min-h-7 flex-1 flex-wrap items-center gap-1.5">
                  {genres.length > 0 ? (
                    genres.map((tag, idx) => (
                      <span
                        key={`g-${idx}`}
                        className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag('genres', idx)}
                          className="rounded text-primary/70 hover:text-primary"
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
                  onClick={() => setModal('genres')}
                  aria-label="장르 추가"
                  title="장르 추가"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <Plus size={14} strokeWidth={2} />
                </button>
              </div>
            </div>

            {/* 분위기 */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">분위기</label>
              <div className="flex items-center gap-1.5">
                <div className="flex min-h-7 flex-1 flex-wrap items-center gap-1.5">
                  {moods.length > 0 ? (
                    moods.map((tag, idx) => (
                      <span
                        key={`m-${idx}`}
                        className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag('moods', idx)}
                          className="rounded text-primary/70 hover:text-primary"
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
                  onClick={() => setModal('moods')}
                  aria-label="분위기 추가"
                  title="분위기 추가"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <Plus size={14} strokeWidth={2} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 하위 문서 요약 */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          기획 문서
        </h3>
        {notes.length > 0 && (
          <ViewToggle mode={viewMode} onChange={setViewMode} />
        )}
      </div>

      {notes.length > 0 ? (
        <div className={viewMode === 'grid'
          ? 'grid grid-cols-1 gap-3 sm:grid-cols-2'
          : 'flex flex-col gap-2'
        }>
          {notes.map((note) => (
            <PlanNoteCard
              key={note.id}
              note={note}
              layout={viewMode}
              onSelect={() => onNoteSelect(note.id)}
            />
          ))}
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">
          좌측 사이드바에서 "+ 새 문서"로 기획 문서를 추가하세요.
        </p>
      )}

      {/* 태그 편집 모달 */}
      <TagEditModal
        open={modal === 'genres'}
        title="장르 편집"
        value={genres}
        onApply={handleTagsApply('genres')}
        onClose={() => setModal(null)}
        placeholder="판타지 입력 후 Enter"
      />
      <TagEditModal
        open={modal === 'moods'}
        title="분위기 편집"
        value={moods}
        onApply={handleTagsApply('moods')}
        onClose={() => setModal(null)}
        placeholder="다크 입력 후 Enter"
      />
    </div>
  );
}

/* ── 기획 문서 카드 ── */

function PlanNoteCard({
  note,
  layout,
  onSelect,
}: {
  note: NoteSummaryRow;
  layout: 'grid' | 'list';
  onSelect: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const previewHtml = useMemo(() => contentToHtml(note.content), [note.content]);

  const handleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((v) => !v);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter') onSelect(); }}
      className={cn(
        'group relative rounded-lg border border-border bg-background text-left transition-colors hover:border-ring hover:bg-primary/5',
        layout === 'grid' ? 'p-4' : 'px-4 py-3',
      )}
    >
      {/* 헤더: 제목 + 펼치기 버튼 */}
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-foreground">
          {note.title?.trim() || '(제목 없음)'}
        </span>
        {previewHtml && (
          <button
            type="button"
            onClick={handleExpand}
            title={expanded ? '접기' : '전문 보기'}
            className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
          >
            <ChevronDown
              size={14}
              className={cn('transition-transform', expanded && 'rotate-180')}
            />
          </button>
        )}
      </div>

      {/* 본문 미리보기 / 전문 */}
      {previewHtml ? (
        <div
          className={cn(
            'note-preview mt-1.5 text-xs text-muted-foreground',
            !expanded && 'line-clamp-3',
          )}
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      ) : (
        <p className="mt-1.5 text-xs text-muted-foreground/50">
          아직 작성된 내용이 없습니다
        </p>
      )}
    </div>
  );
}

function contentToHtml(raw: string | null): string {
  if (!raw) return '';
  try {
    const json = JSON.parse(raw) as object;
    return generateHTML(json, previewExtensions);
  } catch {
    return '';
  }
}

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
