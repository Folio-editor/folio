import { useMemo, useState } from 'react';
import { useQuery } from '@powersync/react';
import { ArrowLeft, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useWriterId } from '../../hooks/useWriterId';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { useDeferredText } from '../../hooks/useDeferredText';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
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
  plot_title: string | null;
}

interface TargetRow {
  id: string;
  title: string;
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
  { value: '상', label: '중요도: 상' },
  { value: '중', label: '중요도: 중' },
  { value: '하', label: '중요도: 하' },
];

const LINK_TYPE_OPTIONS = [
  { value: 'plant', label: '심기' },
  { value: 'resolve', label: '부분회수' },
  { value: 'final_resolve', label: '최종완결' },
];

const LINK_TYPE_COLOR: Record<string, string> = {
  plant: 'border-l-blue-500',
  resolve: 'border-l-green-500',
  final_resolve: 'border-l-red-500',
};

const LINK_TYPE_LABEL: Record<string, string> = {
  plant: '심기',
  resolve: '부분회수',
  final_resolve: '최종완결',
};

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
  const { updateForeshadow } = useLocalWrite();
  const { id } = item;

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
          <div className="flex w-64 gap-2">
            <Select
              options={IMPORTANCE_OPTIONS}
              value={item.importance}
              onChange={(e) => void updateForeshadow(id, { importance: e.target.value })}
            />
            <Select
              options={STATUS_OPTIONS}
              value={item.status}
              onChange={(e) => void updateForeshadow(id, { status: e.target.value })}
            />
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
        />
      </div>

      {/* 복선 연결 관리 */}
      <LinkManagementSection foreshadowId={id} workId={item.work_id} />
    </div>
  );
}

/* ── 복선 연결 관리 섹션 ── */

function LinkManagementSection({
  foreshadowId,
  workId,
}: {
  foreshadowId: string;
  workId: string;
}) {
  const writerId = useWriterId();
  const { createForeshadowLink, deleteForeshadowLink } = useLocalWrite();
  const [expanded, setExpanded] = useState(true);
  const [adding, setAdding] = useState(false);

  const { data: linkRows = [] } = useQuery<LinkRow>(
    `SELECT fl.id, fl.link_type, fl.episode_id, fl.plot_id, fl.context_memo,
            e.title AS episode_title, e.sort_order AS episode_sort,
            p.title AS plot_title
     FROM foreshadow_link fl
     LEFT JOIN episode e ON e.id = fl.episode_id
     LEFT JOIN plot p ON p.id = fl.plot_id
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

  return (
    <div className="shrink-0 border-t border-border">
      {/* 헤더 */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-6 py-3 text-left text-sm font-medium text-foreground hover:bg-muted/30"
      >
        <span className="flex items-center gap-2">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          복선 연결 ({linkRows.length})
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setAdding(true); setExpanded(true); }}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-primary transition-colors hover:bg-primary/10"
        >
          <Plus size={12} />
          추가
        </button>
      </button>

      {expanded && (
        <div className="max-h-64 overflow-y-auto px-6 pb-4">
          {/* 타임라인 게이지 */}
          {linkRows.length > 0 && (
            <div className="mb-3">
              <TimelineGauge links={timelineLinks} range={range} />
            </div>
          )}

          {/* 링크 목록 */}
          {linkRows.length === 0 && !adding && (
            <p className="py-3 text-center text-xs text-muted-foreground">
              아직 연결된 회차가 없습니다.
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            {linkRows.map((link) => (
              <div
                key={link.id}
                className={cn(
                  'flex items-center justify-between rounded-md border-l-2 bg-muted/30 px-3 py-2',
                  LINK_TYPE_COLOR[link.link_type] ?? 'border-l-muted',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium text-foreground">
                      {LINK_TYPE_LABEL[link.link_type] ?? link.link_type}
                    </span>
                    <span className="text-muted-foreground">—</span>
                    <span className="truncate text-muted-foreground">
                      {link.episode_title ?? link.plot_title ?? '(삭제된 항목)'}
                    </span>
                  </div>
                  {link.context_memo && (
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{link.context_memo}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void handleDelete(link.id)}
                  title="연결 삭제"
                  className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>

          {/* 인라인 추가 폼 */}
          {adding && (
            <AddLinkForm
              workId={workId}
              onConfirm={handleAdd}
              onCancel={() => setAdding(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ── 링크 추가 인라인 폼 ── */

function AddLinkForm({
  workId,
  onConfirm,
  onCancel,
}: {
  workId: string;
  onConfirm: (linkType: string, episodeId: string | null, plotId: string | null, memo: string | null) => Promise<void>;
  onCancel: () => void;
}) {
  const writerId = useWriterId();
  const [linkType, setLinkType] = useState('plant');
  const [targetType, setTargetType] = useState<'episode' | 'plot'>('episode');
  const [targetId, setTargetId] = useState('');
  const [memo, setMemo] = useState('');

  const { data: episodes = [] } = useQuery<TargetRow>(
    `SELECT id, title FROM episode
     WHERE work_id = ? AND writer_id = ? AND status != 'trashed'
     ORDER BY sort_order ASC, created_at ASC`,
    [workId, writerId],
  );

  const { data: plots = [] } = useQuery<TargetRow>(
    `SELECT id, title FROM plot
     WHERE work_id = ? AND writer_id = ? AND parent_id IS NOT NULL
     ORDER BY sort_order ASC, created_at ASC`,
    [workId, writerId],
  );

  const targets = targetType === 'episode' ? episodes : plots;
  const targetOptions = useMemo(
    () => targets.map((t) => ({ value: t.id, label: t.title })),
    [targets],
  );

  const handleSubmit = () => {
    if (!targetId) return;
    const epId = targetType === 'episode' ? targetId : null;
    const plId = targetType === 'plot' ? targetId : null;
    void onConfirm(linkType, epId, plId, memo || null);
  };

  return (
    <div className="mt-2 rounded-md border border-border bg-background p-3">
      <div className="flex flex-col gap-2">
        {/* 타입 선택 */}
        <div className="flex gap-2">
          <div className="flex-1">
            <Select
              options={LINK_TYPE_OPTIONS}
              value={linkType}
              onChange={(e) => setLinkType(e.target.value)}
            />
          </div>
          <div className="flex items-center rounded-md border border-border">
            <button
              type="button"
              onClick={() => { setTargetType('episode'); setTargetId(''); }}
              className={cn(
                'px-2 py-1 text-xs transition-colors',
                targetType === 'episode' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground',
              )}
            >
              회차
            </button>
            <button
              type="button"
              onClick={() => { setTargetType('plot'); setTargetId(''); }}
              className={cn(
                'px-2 py-1 text-xs transition-colors',
                targetType === 'plot' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground',
              )}
            >
              플롯
            </button>
          </div>
        </div>

        {/* 대상 선택 */}
        {targetOptions.length > 0 ? (
          <Select
            options={[{ value: '', label: '대상을 선택하세요' }, ...targetOptions]}
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            {targetType === 'episode' ? '회차가 없습니다.' : '플롯이 없습니다.'}
          </p>
        )}

        {/* 메모 */}
        <Input
          type="text"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="맥락 메모 (선택)"
          className="text-xs"
        />

        {/* 버튼 */}
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
            추가
          </button>
        </div>
      </div>
    </div>
  );
}
