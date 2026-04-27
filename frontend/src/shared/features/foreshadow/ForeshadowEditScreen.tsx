import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@powersync/react';
import {
  Check,
  ChevronDown,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useWriterId } from '../../hooks/useWriterId';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { useDeferredText } from '../../hooks/useDeferredText';
import { DeleteConfirmDialog } from '../../components/ui/DeleteConfirmDialog';
import { Input } from '../../components/ui/Input';
import { StatusPillDropdown, type StatusPillOption } from '../../components/ui/StatusPillDropdown';
import { EditorToolbarToggle } from '../../components/editor/EditorToolbarToggle';
import { MainPanelHeader } from '../../components/layout/MainPanelHeader';
import { ContentEditor } from '../../components/editor/ContentEditor';
import { ForeshadowLifecycleStepper } from './ForeshadowLifecycleStepper';
import { cn } from '../../lib/cn';

interface ForeshadowEditScreenProps {
  id: string;
  onBack: () => void;
  onSendToRight?: () => void;
}

interface ForeshadowRow {
  id: string;
  work_id: string;
  title: string;
  status: string;
  importance: string;
  content: string | null;
}

interface LinkRow {
  id: string;
  link_type: string;
  episode_id: string | null;
  plot_id: string | null;
  context_memo: string | null;
  episode_title: string | null;
  episode_sort: number | null;
  episode_parent_title: string | null;
  plot_title: string | null;
  plot_parent_title: string | null;
}

interface TargetRow {
  id: string;
  title: string;
  parent_title: string | null;
}

interface TargetOption {
  value: string;
  label: string;
}

const STATUS_OPTIONS: StatusPillOption[] = [
  { value: '진행중', label: '진행중', tone: 'blue' },
  { value: '완결', label: '완결', tone: 'emerald' },
  { value: '폐기', label: '폐기', tone: 'slate' },
];

const IMPORTANCE_OPTIONS: StatusPillOption[] = [
  { value: '상', label: '상', tone: 'rose' },
  { value: '중', label: '중', tone: 'amber' },
  { value: '하', label: '하', tone: 'sky' },
];

type StageKey = 'plant' | 'resolve' | 'final_resolve';

interface StageMeta {
  type: StageKey;
  title: string;
  description: string;
  empty: string;
  /** 다크모드 호환 dot bg 토큰 */
  dotClass: string;
  /** 다크모드 호환 line bg 토큰 */
  lineClass: string;
}

const LINK_FLOW_STAGES: StageMeta[] = [
  {
    type: 'plant',
    title: '심기',
    description: '독자에게 처음 보여주는 지점',
    empty: '아직 심는 지점이 없습니다.',
    dotClass: 'bg-foreshadow-plant',
    lineClass: 'bg-foreshadow-plant/30',
  },
  {
    type: 'resolve',
    title: '강화',
    description: '반복 노출하거나 의미를 키우는 지점',
    empty: '아직 강화 지점이 없습니다.',
    dotClass: 'bg-foreshadow-resolve',
    lineClass: 'bg-foreshadow-resolve/30',
  },
  {
    type: 'final_resolve',
    title: '회수',
    description: '정체를 밝히거나 결말로 이어지는 지점',
    empty: '아직 회수 지점이 없습니다.',
    dotClass: 'bg-foreshadow-final',
    lineClass: 'bg-foreshadow-final/30',
  },
];

/** 이 폭 미만이면 좌우 분할 대신 위/아래 세로 스택으로 fallback */
const NARROW_BREAKPOINT_PX = 720;

function formatLinkTarget(link: LinkRow) {
  const title = link.episode_title ?? link.plot_title ?? '(삭제된 항목)';
  const parent = link.episode_id ? link.episode_parent_title : link.plot_parent_title;
  return parent ? `${parent} > ${title}` : title;
}

function getLinkTargetKind(link: LinkRow) {
  return link.episode_id ? '원고' : '플롯';
}

function formatTargetOption(target: TargetRow) {
  return target.parent_title ? `${target.parent_title} > ${target.title}` : target.title;
}

export function ForeshadowEditScreen({ id, onBack, onSendToRight }: ForeshadowEditScreenProps) {
  const { data: rows = [] } = useQuery<ForeshadowRow>(
    `SELECT id, work_id, title, status, importance, content FROM foreshadow WHERE id = ?`,
    [id],
  );
  const item = rows[0];

  if (!item) {
    return <div className="p-8 text-sm text-muted-foreground">복선을 불러오는 중…</div>;
  }

  return <ForeshadowEditor key={id} item={item} onBack={onBack} onSendToRight={onSendToRight} />;
}

function ForeshadowEditor({
  item,
  onBack,
  onSendToRight,
}: {
  item: ForeshadowRow;
  onBack: () => void;
  onSendToRight?: () => void;
}) {
  const { updateForeshadow, deleteForeshadow } = useLocalWrite();
  const { id, work_id: workId } = item;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setIsNarrow(entry.contentRect.width < NARROW_BREAKPOINT_PX);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const title = useDeferredText(id, item.title, (v) =>
    void updateForeshadow(id, { title: v }),
  );

  const { data: linkRows = [] } = useQuery<LinkRow>(
    `SELECT fl.id, fl.link_type, fl.episode_id, fl.plot_id, fl.context_memo,
            e.title AS episode_title, e.sort_order AS episode_sort,
            ep.title AS episode_parent_title,
            p.title AS plot_title,
            pp.title AS plot_parent_title
     FROM foreshadow_link fl
     LEFT JOIN episode e ON e.id = fl.episode_id
     LEFT JOIN episode ep ON ep.id = e.parent_id
     LEFT JOIN plot p ON p.id = fl.plot_id
     LEFT JOIN plot pp ON pp.id = p.parent_id
     WHERE fl.foreshadow_id = ?
     ORDER BY fl.created_at ASC`,
    [id],
  );

  const counts = useMemo(() => {
    const c = { plant: 0, resolve: 0, final_resolve: 0 };
    for (const l of linkRows) {
      if (l.link_type in c) c[l.link_type as keyof typeof c]++;
    }
    return c;
  }, [linkRows]);

  return (
    <div className="flex h-full flex-col">
      <MainPanelHeader
        onClose={onBack}
        onSendToRight={onSendToRight}
        title={
          <Input
            value={title.value}
            onChange={(e) => title.onChange(e.target.value)}
            onBlur={title.onBlur}
            placeholder="복선 제목"
            className="border-none px-0 text-base font-medium shadow-none focus-visible:ring-0"
          />
        }
        trailing={
          <div className="flex items-center gap-2">
            <ForeshadowTrackingToggle
              expanded={!collapsed}
              onToggle={() => setCollapsed((v) => !v)}
            />
            <div className="flex gap-1.5">
              <StatusPillDropdown
                value={
                  IMPORTANCE_OPTIONS.some((o) => o.value === item.importance)
                    ? item.importance
                    : '중'
                }
                options={IMPORTANCE_OPTIONS}
                ariaLabel="복선 중요도"
                prefix="중요도 "
                onChange={(importance) => void updateForeshadow(id, { importance })}
              />
              <StatusPillDropdown
                value={
                  STATUS_OPTIONS.some((o) => o.value === item.status)
                    ? item.status
                    : '진행중'
                }
                options={STATUS_OPTIONS}
                ariaLabel="복선 상태"
                onChange={(status) => void updateForeshadow(id, { status })}
              />
            </div>
            <EditorToolbarToggle />
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              title="복선 삭제"
              className="rounded p-2 text-muted-foreground hover:bg-destructive/5 hover:text-destructive"
            >
              <Trash2 size={16} strokeWidth={1.75} />
            </button>
          </div>
        }
      />

      {/* Split View 본체 */}
      <div
        ref={containerRef}
        className={cn(
          'flex min-h-0 flex-1',
          isNarrow ? 'flex-col' : 'flex-row',
        )}
      >
        {/* 좌측: 본문 */}
        <div
          className={cn(
            'min-h-0 min-w-0 overflow-hidden',
            isNarrow
              ? collapsed
                ? 'h-full'
                : 'h-1/2'
              : collapsed
                ? 'flex-1'
                : 'basis-3/5 flex-1',
          )}
        >
          <ContentEditor
            itemId={id}
            initialContent={item.content}
            placeholder="복선의 의도, 회수 시점, 관련 회차를 메모하세요…"
            onUpdate={(content) => void updateForeshadow(id, { content })}
            className="h-full"
          />
        </div>

        {/* 우측 (또는 하단): 추적 + 연결 패널 */}
        {!collapsed && (
          <div
            className={cn(
              'flex min-h-0 min-w-0 flex-col',
              isNarrow ? 'h-1/2 border-t border-border' : 'basis-2/5 border-l border-border',
            )}
          >
            <ForeshadowSidePanel
              foreshadowId={id}
              workId={workId}
              linkRows={linkRows}
              counts={counts}
              status={item.status}
            />
          </div>
        )}
      </div>

      {confirmDelete && (
        <DeleteConfirmDialog
          title="복선 삭제"
          message={`"${item.title}" 복선과 연결된 링크가 영구 삭제됩니다.`}
          busy={deleteBusy}
          onConfirm={() => {
            setDeleteBusy(true);
            void deleteForeshadow(id).then(() => {
              setDeleteBusy(false);
              setConfirmDelete(false);
              onBack();
            });
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

function ForeshadowTrackingToggle({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={expanded ? '추적 패널 접기' : '추적 패널 펼치기'}
      aria-pressed={expanded}
      className={cn(
        'flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors',
        expanded
          ? 'border-primary/30 bg-primary/5 text-foreground'
          : 'border-border bg-background text-muted-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-foreground',
      )}
    >
      {expanded ? (
        <PanelRightClose size={14} strokeWidth={1.75} />
      ) : (
        <PanelRightOpen size={14} strokeWidth={1.75} />
      )}
      <span>추적</span>
    </button>
  );
}

/* ── 우측 추적/연결 패널 ── */

function ForeshadowSidePanel({
  foreshadowId,
  workId,
  linkRows,
  counts,
  status,
}: {
  foreshadowId: string;
  workId: string;
  linkRows: LinkRow[];
  counts: { plant: number; resolve: number; final_resolve: number };
  status: string;
}) {
  const { createForeshadowLink, updateForeshadowLink, deleteForeshadowLink } = useLocalWrite();
  const [adding, setAdding] = useState(false);
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);

  const handleDelete = async (linkId: string) => {
    await deleteForeshadowLink(linkId);
  };

  const handleAdd = async (
    linkType: string,
    episodeId: string | null,
    plotId: string | null,
    memo: string | null,
  ) => {
    await createForeshadowLink(foreshadowId, linkType, episodeId, plotId, memo || null);
    setAdding(false);
  };

  const handleUpdate = async (
    linkId: string,
    linkType: string,
    episodeId: string | null,
    plotId: string | null,
    memo: string | null,
  ) => {
    await updateForeshadowLink(linkId, {
      linkType,
      episodeId,
      plotId,
      contextMemo: memo || null,
    });
    setEditingLinkId(null);
  };

  return (
    <>
      {/* 패널 헤더 */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <span>추적</span>
          <span className="text-xs text-muted-foreground">{linkRows.length}</span>
        </div>
        <button
          type="button"
          onClick={() => {
            setAdding(true);
            setEditingLinkId(null);
          }}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-primary transition-colors hover:bg-primary/10"
        >
          <Plus size={12} />
          연결 추가
        </button>
      </div>

      {/* 패널 본문 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {/* 라이프사이클 진행도 */}
        <div className="mb-4 rounded-lg border border-border bg-background px-4 py-3">
          <div className="mb-3 flex items-center justify-between text-xs">
            <span className="font-medium text-foreground">진행도</span>
            <span className="text-muted-foreground">심기 → 강화 → 회수</span>
          </div>
          <ForeshadowLifecycleStepper
            plant={counts.plant}
            resolve={counts.resolve}
            final={counts.final_resolve}
            status={status}
          />
        </div>

        {linkRows.length === 0 && !adding && (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
            <p className="text-sm font-medium text-foreground">아직 연결된 원고나 플롯이 없습니다.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              복선을 심을 회차, 강화할 장면, 회수할 지점을 추가해보세요.
            </p>
          </div>
        )}

        {/* Vertical Connection Timeline */}
        {linkRows.length > 0 && (
          <div className="flex flex-col gap-4">
            {LINK_FLOW_STAGES.map((stage) => {
              const stageLinks = linkRows.filter((link) => link.link_type === stage.type);
              return (
                <ForeshadowStageTimeline
                  key={stage.type}
                  stage={stage}
                  links={stageLinks}
                  workId={workId}
                  editingLinkId={editingLinkId}
                  onEdit={(linkId) => {
                    setAdding(false);
                    setEditingLinkId(linkId);
                  }}
                  onCancelEdit={() => setEditingLinkId(null)}
                  onDelete={handleDelete}
                  onUpdate={handleUpdate}
                />
              );
            })}
          </div>
        )}

        {adding && (
          <AddLinkForm
            workId={workId}
            submitLabel="추가"
            onConfirm={handleAdd}
            onCancel={() => setAdding(false)}
          />
        )}
      </div>
    </>
  );
}

function ForeshadowStageTimeline({
  stage,
  links,
  workId,
  editingLinkId,
  onEdit,
  onCancelEdit,
  onDelete,
  onUpdate,
}: {
  stage: StageMeta;
  links: LinkRow[];
  workId: string;
  editingLinkId: string | null;
  onEdit: (linkId: string) => void;
  onCancelEdit: () => void;
  onDelete: (linkId: string) => Promise<void>;
  onUpdate: (
    linkId: string,
    linkType: string,
    episodeId: string | null,
    plotId: string | null,
    memo: string | null,
  ) => Promise<void>;
}) {
  const isEmpty = links.length === 0;

  return (
    <section className="rounded-lg border border-border bg-background p-3">
      {/* Stage 헤더 */}
      <header className="mb-3 flex items-baseline gap-2">
        <span className={cn('h-2 w-2 self-center rounded-full', stage.dotClass)} />
        <h3 className="text-xs font-semibold text-foreground">{stage.title}</h3>
        <span className="text-[10px] text-muted-foreground">({links.length})</span>
        <p className="ml-auto text-[10px] text-muted-foreground">{stage.description}</p>
      </header>

      {isEmpty ? (
        <p className="rounded-md bg-muted/30 px-3 py-2.5 text-[11px] text-muted-foreground">
          {stage.empty}
        </p>
      ) : (
        <ol className="relative">
          {/* 좌측 vertical line — 첫 dot부터 마지막 dot까지 */}
          <span
            aria-hidden
            className={cn('absolute left-1.75 top-2 bottom-2 w-px', stage.lineClass)}
          />

          {links.map((link) => {
            const editing = editingLinkId === link.id;
            return (
              <li key={link.id} className="relative pl-6 pb-3 last:pb-0">
                {/* dot */}
                <span
                  aria-hidden
                  className={cn(
                    'absolute left-0 top-2 h-3.5 w-3.5 rounded-full ring-2 ring-background',
                    stage.dotClass,
                  )}
                />

                {/* 카드 */}
                <div className="rounded-md border border-border bg-card px-3 py-2 transition-colors hover:border-primary/30">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex items-center gap-1.5">
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {getLinkTargetKind(link)}
                        </span>
                        {link.episode_sort != null && (
                          <span className="text-[10px] text-muted-foreground">
                            현재 정렬 #{link.episode_sort + 1}
                          </span>
                        )}
                      </div>
                      <p
                        className="truncate text-xs font-medium text-foreground"
                        title={formatLinkTarget(link)}
                      >
                        {formatLinkTarget(link)}
                      </p>
                      {link.context_memo && (
                        <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                          {link.context_memo}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onEdit(link.id)}
                        title="연결 수정"
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void onDelete(link.id)}
                        title="연결 삭제"
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>

                {editing && (
                  <AddLinkForm
                    workId={workId}
                    initialLink={link}
                    submitLabel="수정 완료"
                    onConfirm={(linkType, episodeId, plotId, memo) =>
                      onUpdate(link.id, linkType, episodeId, plotId, memo)
                    }
                    onCancel={onCancelEdit}
                  />
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function TargetDropdown({
  value,
  options,
  placeholder,
  onChange,
}: {
  value: string;
  options: TargetOption[];
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'flex h-10 w-full items-center justify-between rounded-lg border border-border bg-card px-3 text-left text-xs shadow-sm transition-colors',
          'hover:border-primary/35 hover:bg-background focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/10',
          selected ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        <span className="min-w-0 truncate">{selected?.label ?? placeholder}</span>
        <ChevronDown
          size={15}
          strokeWidth={1.8}
          className={cn('shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-40 mt-1 max-h-52 overflow-y-auto rounded-lg border border-border bg-background p-1 shadow-xl"
        >
          {options.map((option) => {
            const selectedOption = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selectedOption}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-xs transition-colors',
                  selectedOption
                    ? 'bg-primary/10 font-medium text-primary'
                    : 'text-foreground hover:bg-muted/60',
                )}
              >
                <span className="min-w-0 truncate">{option.label}</span>
                {selectedOption && <Check size={14} strokeWidth={2} className="shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── 링크 추가 인라인 폼 ── */

function AddLinkForm({
  workId,
  initialLink,
  submitLabel = '추가',
  onConfirm,
  onCancel,
}: {
  workId: string;
  initialLink?: LinkRow;
  submitLabel?: string;
  onConfirm: (linkType: string, episodeId: string | null, plotId: string | null, memo: string | null) => Promise<void>;
  onCancel: () => void;
}) {
  const writerId = useWriterId();
  const [linkType, setLinkType] = useState(initialLink?.link_type ?? 'plant');
  const [targetType, setTargetType] = useState<'episode' | 'plot'>(
    initialLink?.plot_id ? 'plot' : 'episode',
  );
  const [targetId, setTargetId] = useState(initialLink?.episode_id ?? initialLink?.plot_id ?? '');
  const [memo, setMemo] = useState(initialLink?.context_memo ?? '');

  const { data: episodes = [] } = useQuery<TargetRow>(
    `SELECT e.id, e.title, ep.title AS parent_title
     FROM episode e
     LEFT JOIN episode ep ON ep.id = e.parent_id
     WHERE e.work_id = ? AND e.writer_id = ? AND e.status != 'trashed'
     ORDER BY e.sort_order ASC, e.created_at ASC`,
    [workId, writerId],
  );

  const { data: plots = [] } = useQuery<TargetRow>(
    `SELECT p.id, p.title, pp.title AS parent_title
     FROM plot p
     LEFT JOIN plot pp ON pp.id = p.parent_id
     WHERE p.work_id = ? AND p.writer_id = ? AND p.parent_id IS NOT NULL
     ORDER BY p.sort_order ASC, p.created_at ASC`,
    [workId, writerId],
  );

  const targets = targetType === 'episode' ? episodes : plots;
  const targetOptions = useMemo(
    () => targets.map((t) => ({ value: t.id, label: formatTargetOption(t) })),
    [targets],
  );

  const handleSubmit = () => {
    if (!targetId) return;
    const epId = targetType === 'episode' ? targetId : null;
    const plId = targetType === 'plot' ? targetId : null;
    void onConfirm(linkType, epId, plId, memo || null);
  };

  return (
    <div className="mt-3 rounded-lg border border-border bg-background p-4 shadow-sm">
      <div className="flex flex-col gap-3">
        <div>
          <p className="mb-2 text-xs font-medium text-foreground">복선 역할</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {LINK_FLOW_STAGES.map((stage) => {
              const selected = linkType === stage.type;
              return (
                <button
                  key={stage.type}
                  type="button"
                  onClick={() => setLinkType(stage.type)}
                  className={cn(
                    'flex flex-col rounded-md border px-3 py-2 text-left transition-colors',
                    selected
                      ? 'border-primary/40 bg-primary/5 text-foreground shadow-sm'
                      : 'border-border bg-muted/20 text-muted-foreground hover:border-primary/30 hover:bg-muted/40',
                  )}
                >
                  <span className="flex items-center gap-1.5 text-xs font-medium">
                    <span className={cn('h-1.5 w-1.5 rounded-full', stage.dotClass)} />
                    {stage.title}
                  </span>
                  <span className="mt-0.5 block text-[10px] leading-relaxed opacity-80">
                    {stage.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-foreground">연결 대상</p>
          <div className="mb-2 inline-flex items-center rounded-md border border-border bg-muted/20 p-0.5">
            <button
              type="button"
              onClick={() => { setTargetType('episode'); setTargetId(''); }}
              className={cn(
                'rounded px-2.5 py-1 text-xs transition-colors',
                targetType === 'episode' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
              )}
            >
              원고
            </button>
            <button
              type="button"
              onClick={() => { setTargetType('plot'); setTargetId(''); }}
              className={cn(
                'rounded px-2.5 py-1 text-xs transition-colors',
                targetType === 'plot' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
              )}
            >
              플롯
            </button>
          </div>

          {targetOptions.length > 0 ? (
            <TargetDropdown
              value={targetId}
              options={targetOptions}
              placeholder={`${targetType === 'episode' ? '원고' : '플롯'}를 선택하세요`}
              onChange={setTargetId}
            />
          ) : (
            <p className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {targetType === 'episode' ? '원고가 없습니다.' : '플롯이 없습니다.'}
            </p>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-foreground">메모</p>
          <Input
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="예: 서윤이 유리역에서 처음 단서를 발견함"
            className="text-xs"
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!targetId}
            className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
