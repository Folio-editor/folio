import { useMemo, useState, useRef, useEffect } from 'react';
import { useQuery } from '@powersync/react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { useWriterId } from '../../hooks/useWriterId';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { useDeferredText } from '../../hooks/useDeferredText';
import { Button } from '../../components/ui/Button';
import { MainPanelHeader } from '../../components/layout/MainPanelHeader';
import { cn } from '../../lib/cn';

interface PlotOverviewProps {
  workId: string;
}

interface ActRow {
  id: string;
  title: string;
  content: string | null;
}

interface EpisodeRow {
  id: string;
  parent_id: string;
  title: string;
  status: string | null;
  content: string | null;
}

const STATUS_COLOR: Record<string, string> = {
  '예정': 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  '작성중': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  '완료': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

const STATUS_OPTIONS = ['예정', '작성중', '완료'];

export function PlotOverview({ workId }: PlotOverviewProps) {
  const writerId = useWriterId();
  const { createPlot } = useLocalWrite();
  const [collapsedActs, setCollapsedActs] = useState<Set<string>>(new Set());

  const { data: acts = [] } = useQuery<ActRow>(
    `SELECT id, title, content FROM plot
     WHERE work_id = ? AND writer_id = ? AND parent_id IS NULL
     ORDER BY sort_order ASC, created_at ASC`,
    [workId, writerId],
  );

  const { data: episodes = [] } = useQuery<EpisodeRow>(
    `SELECT id, parent_id, title, status, content FROM plot
     WHERE work_id = ? AND writer_id = ? AND parent_id IS NOT NULL
     ORDER BY sort_order ASC, created_at ASC`,
    [workId, writerId],
  );

  const episodesByAct = useMemo(() => {
    const map = new Map<string, EpisodeRow[]>();
    for (const ep of episodes) {
      if (!map.has(ep.parent_id)) map.set(ep.parent_id, []);
      map.get(ep.parent_id)!.push(ep);
    }
    return map;
  }, [episodes]);

  const toggleCollapse = (actId: string) => {
    setCollapsedActs((prev) => {
      const next = new Set(prev);
      if (next.has(actId)) next.delete(actId);
      else next.add(actId);
      return next;
    });
  };

  const handleNewAct = async () => {
    const title = `${acts.length + 1}막`;
    await createPlot(workId, title, acts.length);
  };

  const handleNewEpisode = async (actId: string) => {
    const siblings = episodesByAct.get(actId) ?? [];
    const title = `${siblings.length + 1}화`;
    await createPlot(workId, title, siblings.length, actId);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MainPanelHeader
        title={<h2 className="text-lg font-semibold">플롯</h2>}
        subtitle="줄거리 구조와 회차별 전개를 설계합니다"
        trailing={<Button onClick={() => void handleNewAct()}>+ 새 막</Button>}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {acts.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            아직 플롯이 없습니다. 새 막을 추가하여 줄거리를 설계하세요.
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            {acts.map((act) => (
              <ActSection
                key={act.id}
                act={act}
                episodes={episodesByAct.get(act.id) ?? []}
                isCollapsed={collapsedActs.has(act.id)}
                onToggle={() => toggleCollapse(act.id)}
                onNewEpisode={() => void handleNewEpisode(act.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── 막 섹션 ── */

function ActSection({
  act,
  episodes,
  isCollapsed,
  onToggle,
  onNewEpisode,
}: {
  act: ActRow;
  episodes: EpisodeRow[];
  isCollapsed: boolean;
  onToggle: () => void;
  onNewEpisode: () => void;
}) {
  const { updatePlot } = useLocalWrite();
  const title = useDeferredText(act.id, act.title, (v) => void updatePlot(act.id, { title: v }));

  return (
    <div className="rounded-lg border border-border bg-background shadow-sm">
      {/* 막 헤더 */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </button>

        <input
          type="text"
          value={title.value}
          onChange={(e) => title.onChange(e.target.value)}
          onBlur={title.onBlur}
          placeholder="막 제목"
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-foreground outline-none placeholder:text-muted-foreground"
        />

        <span className="shrink-0 text-xs text-muted-foreground">{episodes.length}개</span>
      </div>

      {/* 회차 플로우 리스트 */}
      {!isCollapsed && (
        <div className="flex flex-col gap-3 p-4">
          {episodes.map((ep) => (
            <EpisodeRow key={ep.id} episode={ep} />
          ))}

          {/* + 회차 추가 버튼 */}
          <button
            type="button"
            onClick={onNewEpisode}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-3 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
          >
            <Plus size={14} />
            <span>새 회차 추가</span>
          </button>
        </div>
      )}
    </div>
  );
}

/* ── 회차 행 (와이어프레임: [제목] + [플롯 내용] 가로 배치) ── */

function EpisodeRow({ episode }: { episode: EpisodeRow }) {
  const { updatePlot } = useLocalWrite();

  const title = useDeferredText(
    episode.id,
    episode.title,
    (v) => void updatePlot(episode.id, { title: v }),
  );

  const contentText = useMemo(() => extractPlainText(episode.content), [episode.content]);
  const [draft, setDraft] = useState(contentText);
  const lastIdRef = useRef(episode.id);

  useEffect(() => {
    if (lastIdRef.current !== episode.id) {
      lastIdRef.current = episode.id;
      setDraft(extractPlainText(episode.content));
    }
  }, [episode.id, episode.content]);

  useEffect(() => {
    if (lastIdRef.current === episode.id) {
      setDraft(extractPlainText(episode.content));
    }
  }, [episode.id, episode.content]);

  const commitContent = () => {
    const current = extractPlainText(episode.content);
    if (draft === current) return;
    const json = plainTextToTiptap(draft);
    void updatePlot(episode.id, { content: JSON.stringify(json) });
  };

  const cycleStatus = () => {
    const idx = STATUS_OPTIONS.indexOf(episode.status ?? '예정');
    const next = STATUS_OPTIONS[(idx + 1) % STATUS_OPTIONS.length];
    void updatePlot(episode.id, { status: next });
  };

  return (
    <div className="flex items-stretch gap-3">
      {/* 제목 박스 */}
      <div className="flex w-28 shrink-0 flex-col items-center justify-center rounded-lg border border-border bg-card p-2">
        <input
          type="text"
          value={title.value}
          onChange={(e) => title.onChange(e.target.value)}
          onBlur={title.onBlur}
          placeholder="제목"
          className="w-full bg-transparent text-center text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground"
        />
        {episode.status && (
          <button
            type="button"
            onClick={cycleStatus}
            title="클릭하여 상태 변경"
            className={cn(
              'mt-1.5 rounded-full px-2 py-0.5 text-[10px] transition-colors',
              STATUS_COLOR[episode.status] ?? 'bg-muted',
            )}
          >
            {episode.status}
          </button>
        )}
      </div>

      {/* 플롯 내용 박스 */}
      <div className="flex min-h-16 flex-1 rounded-lg border border-border bg-card">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitContent}
          placeholder="플롯 내용을 입력하세요…"
          rows={2}
          className="w-full resize-none bg-transparent px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>
    </div>
  );
}

/* ── 유틸 ── */

function extractPlainText(raw: string | null): string {
  if (!raw) return '';
  try {
    const json = JSON.parse(raw);
    if (!json.content) return '';
    return json.content
      .map((node: { content?: { text?: string }[] }) =>
        node.content?.map((c) => c.text ?? '').join('') ?? '',
      )
      .join('\n');
  } catch {
    return '';
  }
}

function plainTextToTiptap(text: string) {
  const lines = text.split('\n');
  return {
    type: 'doc',
    content: lines.map((line) => ({
      type: 'paragraph',
      content: line ? [{ type: 'text', text: line }] : [],
    })),
  };
}
