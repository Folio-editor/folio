import { useCallback, useMemo, useRef, useState } from 'react';
import { useQuery } from '@powersync/react';
import { ArrowLeft, Check, ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { useWriterId } from '../../hooks/useWriterId';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { useDeferredText } from '../../hooks/useDeferredText';
import { DeleteConfirmDialog } from '../../components/ui/DeleteConfirmDialog';
import { Input } from '../../components/ui/Input';
import { IconButton } from '../../components/ui/IconButton';
import { MainPanelHeader } from '../../components/layout/MainPanelHeader';
import { ContentEditor } from '../../components/editor/ContentEditor';
import { TimelineGauge } from './TimelineGauge';
import { cn } from '../../lib/cn';

interface ForeshadowEditScreenProps {
  id: string;
  onBack: () => void;
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

interface RangeRow {
  min_order: number | null;
  max_order: number | null;
}

const STATUS_OPTIONS = [
  { value: '진행중', label: '진행중' },
  { value: '완결', label: '완결' },
  { value: '폐기', label: '폐기' },
];

const IMPORTANCE_OPTIONS = [
  { value: '상', label: '중요도 : 상' },
  { value: '중', label: '중요도 : 중' },
  { value: '하', label: '중요도 : 하' },
];

const IMPORTANCE_STYLES: Record<string, { button: string; dot: string; item: string }> = {
  상: {
    button: 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100',
    dot: 'bg-rose-500',
    item: 'hover:bg-rose-50',
  },
  중: {
    button: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100',
    dot: 'bg-amber-500',
    item: 'hover:bg-amber-50',
  },
  하: {
    button: 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100',
    dot: 'bg-sky-500',
    item: 'hover:bg-sky-50',
  },
};

const STATUS_STYLES: Record<string, { button: string; dot: string; item: string }> = {
  진행중: {
    button: 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100',
    dot: 'bg-blue-500',
    item: 'hover:bg-blue-50',
  },
  완결: {
    button: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
    dot: 'bg-emerald-500',
    item: 'hover:bg-emerald-50',
  },
  폐기: {
    button: 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100',
    dot: 'bg-slate-400',
    item: 'hover:bg-slate-50',
  },
};

const LINK_TYPE_COLOR: Record<string, string> = {
  plant: 'border-l-blue-500',
  resolve: 'border-l-amber-500',
  final_resolve: 'border-l-emerald-500',
};

const LINK_TYPE_BADGE: Record<string, string> = {
  plant: 'border-blue-200 bg-blue-50 text-blue-700',
  resolve: 'border-amber-200 bg-amber-50 text-amber-700',
  final_resolve: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

const LINK_FLOW_STAGES = [
  {
    type: 'plant',
    title: '심기',
    description: '독자에게 처음 보여주는 지점',
    empty: '아직 심는 지점이 없습니다.',
  },
  {
    type: 'resolve',
    title: '강화',
    description: '반복 노출하거나 의미를 키우는 지점',
    empty: '아직 강화 지점이 없습니다.',
  },
  {
    type: 'final_resolve',
    title: '회수',
    description: '정체를 밝히거나 결말로 이어지는 지점',
    empty: '아직 회수 지점이 없습니다.',
  },
];

const LINK_PANEL_DEFAULT_HEIGHT = 300;
const LINK_PANEL_MIN_HEIGHT = 140;
const LINK_PANEL_MAX_HEIGHT = 520;

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

export function ForeshadowEditScreen({ id, onBack }: ForeshadowEditScreenProps) {
  const { data: rows = [] } = useQuery<ForeshadowRow>(
    `SELECT id, work_id, title, status, importance, content FROM foreshadow WHERE id = ?`,
    [id],
  );
  const item = rows[0];

  if (!item) {
    return <div className="p-8 text-sm text-muted-foreground">복선을 불러오는 중…</div>;
  }

  return <ForeshadowEditor key={id} item={item} onBack={onBack} />;
}

function ForeshadowEditor({ item, onBack }: { item: ForeshadowRow; onBack: () => void }) {
  const { updateForeshadow, deleteForeshadow } = useLocalWrite();
  const { id } = item;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [linkPanelHeight, setLinkPanelHeight] = useState(LINK_PANEL_DEFAULT_HEIGHT);

  const title = useDeferredText(id, item.title, (v) =>
    void updateForeshadow(id, { title: v }),
  );

  return (
    <div className="flex h-full flex-col">
      <MainPanelHeader
        leading={<IconButton onClick={onBack} title="목록으로"><ArrowLeft className="h-4 w-4" /></IconButton>}
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
            <div className="flex gap-2">
              <ForeshadowDropdown
                value={
                  IMPORTANCE_OPTIONS.some((o) => o.value === item.importance)
                    ? item.importance
                    : '중'
                }
                options={IMPORTANCE_OPTIONS}
                styles={IMPORTANCE_STYLES}
                fallback="중"
                ariaLabel="복선 중요도"
                onChange={(importance) => void updateForeshadow(id, { importance })}
              />
              <ForeshadowDropdown
                value={
                  STATUS_OPTIONS.some((o) => o.value === item.status)
                    ? item.status
                    : '진행중'
                }
                options={STATUS_OPTIONS}
                styles={STATUS_STYLES}
                fallback="진행중"
                ariaLabel="복선 상태"
                onChange={(status) => void updateForeshadow(id, { status })}
              />
            </div>
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

      {/* 에디터 영역 (flex-1의 절반) */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <ContentEditor
          itemId={id}
          initialContent={item.content}
          placeholder="복선의 의도, 회수 시점, 관련 회차를 메모하세요…"
          onUpdate={(content) => void updateForeshadow(id, { content })}
          className="h-full"
        />
      </div>

      {/* 복선 연결 관리 */}
      <LinkManagementSection
        foreshadowId={id}
        workId={item.work_id}
        panelHeight={linkPanelHeight}
        onPanelResize={(delta) =>
          setLinkPanelHeight((height) =>
            Math.max(
              LINK_PANEL_MIN_HEIGHT,
              Math.min(LINK_PANEL_MAX_HEIGHT, height - delta),
            ),
          )
        }
      />

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

function ForeshadowDropdown({
  value,
  options,
  styles,
  fallback,
  ariaLabel,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  styles: Record<string, { button: string; dot: string; item: string }>;
  fallback: string;
  ariaLabel: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const currentStyle = styles[value] ?? styles[fallback];
  const currentLabel = options.find((option) => option.value === value)?.label ?? value;

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
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-9 w-32 items-center justify-between rounded-lg border px-3 text-sm font-medium shadow-sm transition-colors',
          currentStyle.button,
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', currentStyle.dot)} />
          <span className="truncate">{currentLabel}</span>
        </span>
        <ChevronDown
          size={15}
          strokeWidth={1.8}
          className={cn('shrink-0 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className="absolute right-0 top-full z-30 mt-2 w-32 overflow-hidden rounded-lg border border-border bg-background p-1 shadow-lg"
        >
          {options.map((option) => {
            const selected = option.value === value;
            const style = styles[option.value] ?? styles[fallback];
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm text-foreground transition-colors',
                  style.item,
                  selected && 'bg-muted font-medium',
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', style.dot)} />
                  <span className="truncate">{option.label}</span>
                </span>
                {selected && <Check size={14} strokeWidth={2} className="shrink-0 text-muted-foreground" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── 복선 연결 관리 섹션 ── */

function LinkManagementSection({
  foreshadowId,
  workId,
  panelHeight,
  onPanelResize,
}: {
  foreshadowId: string;
  workId: string;
  panelHeight: number;
  onPanelResize: (deltaPx: number) => void;
}) {
  const writerId = useWriterId();
  const { createForeshadowLink, updateForeshadowLink, deleteForeshadowLink } = useLocalWrite();
  const [expanded, setExpanded] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);

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
    [foreshadowId],
  );

  const { data: rangeRows = [] } = useQuery<RangeRow>(
    `SELECT MIN(sort_order) AS min_order, MAX(sort_order) AS max_order
     FROM episode WHERE work_id = ? AND writer_id = ? AND status != 'trashed'`,
    [workId, writerId],
  );

  const range = {
    min: rangeRows[0]?.min_order ?? 0,
    max: rangeRows[0]?.max_order ?? 0,
  };

  const timelineLinks = linkRows.map((l) => ({
    link_type: l.link_type,
    episode_sort: l.episode_sort,
    episode_title: l.episode_title,
  }));

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
    <div
      className="relative flex shrink-0 flex-col border-t border-border"
      style={expanded ? { height: panelHeight } : undefined}
    >
      {expanded && <ForeshadowPanelResizeHandle onResize={onPanelResize} />}
      <div className="flex items-center justify-between px-6 py-3 hover:bg-muted/30">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-left text-sm font-medium text-foreground"
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span>복선 연결 ({linkRows.length})</span>
        </button>
        <button
          type="button"
          onClick={() => { setAdding(true); setEditingLinkId(null); setExpanded(true); }}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-primary transition-colors hover:bg-primary/10"
        >
          <Plus size={12} />
          추가
        </button>
      </div>

      {expanded && (
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5">
          {linkRows.length > 0 && (
            <div className="mb-4 rounded-lg border border-border bg-background px-4 py-3">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">원고 흐름</span>
                <span className="text-muted-foreground">심기 · 강화 · 회수</span>
              </div>
              <TimelineGauge links={timelineLinks} range={range} />
            </div>
          )}

          {linkRows.length === 0 && !adding && (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
              <p className="text-sm font-medium text-foreground">아직 연결된 원고나 플롯이 없습니다.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                복선을 심을 회차, 강화할 장면, 회수할 지점을 추가해보세요.
              </p>
            </div>
          )}

          {linkRows.length > 0 && (
            <div className="grid gap-3 md:grid-cols-3">
              {LINK_FLOW_STAGES.map((stage) => {
                const stageLinks = linkRows.filter((link) => link.link_type === stage.type);
                return (
                  <div
                    key={stage.type}
                    className="min-h-32 rounded-lg border border-border bg-background p-3"
                  >
                    <div className="mb-3">
                      <span
                        className={cn(
                          'inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium',
                          LINK_TYPE_BADGE[stage.type],
                        )}
                      >
                        {stage.title}
                      </span>
                      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                        {stage.description}
                      </p>
                    </div>

                    {stageLinks.length === 0 ? (
                      <p className="rounded-md bg-muted/30 px-3 py-3 text-[11px] text-muted-foreground">
                        {stage.empty}
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {stageLinks.map((link) => (
                          <div key={link.id} className="space-y-2">
                            <ForeshadowLinkCard
                              link={link}
                              onEdit={(targetLink) => {
                                setAdding(false);
                                setEditingLinkId(targetLink.id);
                              }}
                              onDelete={handleDelete}
                            />
                            {editingLinkId === link.id && (
                              <AddLinkForm
                                workId={workId}
                                initialLink={link}
                                submitLabel="수정 완료"
                                onConfirm={(linkType, episodeId, plotId, memo) =>
                                  handleUpdate(link.id, linkType, episodeId, plotId, memo)
                                }
                                onCancel={() => setEditingLinkId(null)}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
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
      )}
    </div>
  );
}

function ForeshadowLinkCard({
  link,
  onEdit,
  onDelete,
}: {
  link: LinkRow;
  onEdit: (link: LinkRow) => void;
  onDelete: (linkId: string) => Promise<void>;
}) {
  return (
    <div
      className={cn(
        'rounded-md border-l-2 bg-muted/30 px-3 py-2',
        LINK_TYPE_COLOR[link.link_type] ?? 'border-l-muted',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-1.5">
            <span className="rounded bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {getLinkTargetKind(link)}
            </span>
            {link.episode_sort != null && (
              <span className="text-[10px] text-muted-foreground">
                {link.episode_sort + 1}번째
              </span>
            )}
          </div>
          <p className="truncate text-xs font-medium text-foreground" title={formatLinkTarget(link)}>
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
            onClick={() => onEdit(link)}
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
  );
}

function ForeshadowPanelResizeHandle({ onResize }: { onResize: (deltaPx: number) => void }) {
  const lastYRef = useRef(0);

  const beginDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      lastYRef.current = e.clientY;
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'row-resize';

      const updateDrag = (ev: PointerEvent) => {
        const delta = ev.clientY - lastYRef.current;
        lastYRef.current = ev.clientY;
        onResize(delta);
      };

      const endDrag = () => {
        el.removeEventListener('pointermove', updateDrag);
        el.removeEventListener('pointerup', endDrag);
        el.removeEventListener('pointercancel', endDrag);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      };

      el.addEventListener('pointermove', updateDrag);
      el.addEventListener('pointerup', endDrag);
      el.addEventListener('pointercancel', endDrag);
    },
    [onResize],
  );

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="복선 연결 패널 높이 조절"
      onPointerDown={beginDrag}
      className="group absolute -top-1 left-0 right-0 z-20 flex h-2 cursor-row-resize items-center justify-center"
    >
      <div className="h-0.5 w-10 rounded-full bg-transparent transition-colors group-hover:bg-primary/40 group-active:bg-primary/60" />
    </div>
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
          <div className="grid gap-2 sm:grid-cols-3">
            {LINK_FLOW_STAGES.map((stage) => {
              const selected = linkType === stage.type;
              return (
                <button
                  key={stage.type}
                  type="button"
                  onClick={() => setLinkType(stage.type)}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-left transition-colors',
                    selected
                      ? `${LINK_TYPE_BADGE[stage.type]} shadow-sm`
                      : 'border-border bg-muted/20 text-muted-foreground hover:bg-muted/40',
                  )}
                >
                  <span className="block text-xs font-medium">{stage.title}</span>
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
