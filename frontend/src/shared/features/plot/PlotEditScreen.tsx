import { useQuery } from '@powersync/react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { useDeferredText } from '../../hooks/useDeferredText';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { IconButton } from '../../components/ui/IconButton';
import { MainPanelHeader } from '../../components/layout/MainPanelHeader';
import { EditorToolbarToggle } from '../../components/editor/EditorToolbarToggle';
import { UnifiedEditorToolbar } from '../../components/editor/UnifiedEditorToolbar';
import { BreadcrumbTitle } from '../../components/layout/BreadcrumbTitle';
import { ContentEditor } from '../../components/editor/ContentEditor';
import { WorldNoteInlineEditor } from '../world-note/WorldNoteInlineEditor';
import { cn } from '../../lib/cn';

interface PlotEditScreenProps {
  id: string;
  onBack: () => void;
}

interface PlotRow {
  id: string;
  title: string;
  status: string;
  content: string | null;
  parent_id: string | null;
  work_id: string;
}

const STATUS_OPTIONS = [
  { value: '예정', label: '예정' },
  { value: '작성중', label: '작성중' },
  { value: '완료', label: '완료' },
];

export function PlotEditScreen({ id, onBack }: PlotEditScreenProps) {
  const { data: rows = [] } = useQuery<PlotRow>(
    `SELECT id, title, status, content, parent_id, work_id FROM plot WHERE id = ?`,
    [id],
  );
  const item = rows[0];

  if (!item) {
    return <div className="p-8 text-sm text-muted-foreground">플롯을 불러오는 중…</div>;
  }

  // 막(parent_id IS NULL) → 통합 편집 뷰 (막 본문 + 회차 카드들)
  if (item.parent_id === null) {
    return <ActDetailScreen key={id} act={item} onBack={onBack} />;
  }
  // 회차 → 단일 디테일 편집 (기존)
  return <PlotEditor key={id} item={item} onBack={onBack} />;
}

/* ── 회차 단일 편집 (기존 동작) ── */
function PlotEditor({ item, onBack }: { item: PlotRow; onBack: () => void }) {
  const { updatePlot } = useLocalWrite();
  const { id } = item;
  const title = useDeferredText(id, item.title, (v) => void updatePlot(id, { title: v }));

  // 부모 막 제목 fetch — breadcrumb 표시용
  const { data: parentRows = [] } = useQuery<{ title: string }>(
    item.parent_id
      ? `SELECT title FROM plot WHERE id = ? LIMIT 1`
      : `SELECT '' AS title WHERE 0`,
    item.parent_id ? [item.parent_id] : [],
  );
  const parentTitle = parentRows[0]?.title ?? '';

  return (
    <div className="flex h-full flex-col">
      <MainPanelHeader
        leading={<IconButton onClick={onBack} title="목록으로">←</IconButton>}
        title={
          <BreadcrumbTitle
            items={['플롯', parentTitle]}
            trailing={
              <Input
                value={title.value}
                onChange={(e) => title.onChange(e.target.value)}
                onBlur={title.onBlur}
                placeholder="플롯 제목"
                className="border-none px-0 text-sm font-semibold shadow-none focus-visible:ring-0"
              />
            }
          />
        }
        trailing={
          <div className="flex items-center gap-2">
            <div className="w-32">
              <Select
                options={STATUS_OPTIONS}
                value={item.status}
                onChange={(e) => void updatePlot(id, { status: e.target.value })}
              />
            </div>
            <EditorToolbarToggle />
          </div>
        }
      />
      <ContentEditor
        itemId={id}
        initialContent={item.content}
        placeholder="회차의 줄거리와 핵심 사건을 정리하세요…"
        onUpdate={(content) => void updatePlot(id, { content })}
      />
    </div>
  );
}

/* ── 막 통합 편집 화면 — 막 본문 + 자식 회차 카드들 ── */

interface EpisodeRow {
  id: string;
  title: string;
  status: string | null;
  content: string | null;
  sort_order: number | null;
}

function ActDetailScreen({ act, onBack }: { act: PlotRow; onBack: () => void }) {
  const { updatePlot, createPlot } = useLocalWrite();
  const { id } = act;
  const title = useDeferredText(id, act.title, (v) => void updatePlot(id, { title: v }));

  const { data: episodes = [] } = useQuery<EpisodeRow>(
    `SELECT id, title, status, content, sort_order FROM plot
     WHERE parent_id = ? ORDER BY sort_order ASC, created_at ASC`,
    [id],
  );

  const handleNewEpisode = async () => {
    const epTitle = `${episodes.length + 1}화`;
    await createPlot(act.work_id, epTitle, episodes.length, id);
  };

  return (
    <div className="flex h-full flex-col">
      <MainPanelHeader
        leading={<IconButton onClick={onBack} title="목록으로">←</IconButton>}
        title={
          <BreadcrumbTitle
            items={['플롯']}
            trailing={
              <Input
                value={title.value}
                onChange={(e) => title.onChange(e.target.value)}
                onBlur={title.onBlur}
                placeholder="막 제목"
                className="border-none px-0 text-sm font-semibold shadow-none focus-visible:ring-0"
              />
            }
          />
        }
        trailing={
          <div className="flex items-center gap-2">
            <div className="w-32">
              <Select
                options={STATUS_OPTIONS}
                value={act.status}
                onChange={(e) => void updatePlot(id, { status: e.target.value })}
              />
            </div>
            <EditorToolbarToggle />
          </div>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <UnifiedEditorToolbar mode="shared" />
        <div className="mx-auto max-w-3xl px-8 py-6">
          {/* 막 본문 */}
          <WorldNoteInlineEditor
            noteId={id}
            initialContent={act.content}
            placeholder="막 전체의 줄거리와 핵심 사건을 정리하세요…"
            onUpdate={(json) => void updatePlot(id, { content: json })}
            size="base"
          />

          {/* 회차 리스트 */}
          <div className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                회차 ({episodes.length})
              </h3>
              <button
                type="button"
                onClick={() => void handleNewEpisode()}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Plus size={12} />
                새 회차
              </button>
            </div>
            {episodes.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                회차가 없습니다.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {episodes.map((ep) => (
                  <EpisodeCard key={ep.id} episode={ep} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EpisodeCard({ episode }: { episode: EpisodeRow }) {
  const { updatePlot } = useLocalWrite();
  const [collapsed, setCollapsed] = useState(false);
  const title = useDeferredText(
    episode.id,
    episode.title,
    (v) => void updatePlot(episode.id, { title: v }),
  );

  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
        <Input
          value={title.value}
          onChange={(e) => title.onChange(e.target.value)}
          onBlur={title.onBlur}
          placeholder="회차 제목"
          className="min-w-0 flex-1 border-none px-0 text-sm font-medium shadow-none focus-visible:ring-0"
        />
        <div className="w-24 shrink-0">
          <Select
            options={STATUS_OPTIONS}
            value={episode.status ?? '예정'}
            onChange={(e) => void updatePlot(episode.id, { status: e.target.value })}
            className="text-xs"
          />
        </div>
      </div>
      <div className={cn('mt-2 border-t border-border/50 pt-2', collapsed && 'hidden')}>
        <WorldNoteInlineEditor
          noteId={episode.id}
          initialContent={episode.content}
          placeholder="회차의 줄거리와 핵심 사건을 정리하세요…"
          onUpdate={(json) => void updatePlot(episode.id, { content: json })}
          size="sm"
        />
      </div>
    </div>
  );
}
