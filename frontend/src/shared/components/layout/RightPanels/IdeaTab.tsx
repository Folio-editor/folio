import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@powersync/react';
import {
  ArrowDownAZ,
  ArrowLeft,
  ArrowUpDown,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Search,
  Send,
  Trash2,
} from 'lucide-react';
import { ContentEditor } from '../../editor/ContentEditor';
import { Select } from '../../ui/Select';
import { Popover } from '../../ui/Popover';
import { DeleteConfirmDialog } from '../../ui/DeleteConfirmDialog';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '../../ui/context-menu';
import { useLocalWrite } from '../../../hooks/useLocalWrite';
import { useWriterId } from '../../../hooks/useWriterId';
import { useDecryptedIdeaArchiveList } from '../../../hooks/useDecryptedIdeaArchive';
import { TAG_LIST, TAG_COLOR, TAG_OPTIONS, TAG_DOT_COLOR } from '../../../features/idea-archive/ideaConstants';
import { extractText, textToTiptap, timeAgo } from '../../../features/idea-archive/ideaUtils';
import { cn } from '../../../lib/cn';

/* ── Idea 탭 ── */

export function IdeaTabContent({ selectedWorkId }: { selectedWorkId: string | null }) {
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);

  useEffect(() => {
    setView('list');
    setSelectedIdeaId(null);
    setActiveTag(null);
  }, [selectedWorkId]);

  if (!selectedWorkId) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-muted-foreground">
        작품을 먼저 선택하세요.
      </div>
    );
  }

  if (view === 'detail' && selectedIdeaId) {
    return (
      <IdeaPanelDetail
        id={selectedIdeaId}
        onBack={() => {
          setView('list');
          setSelectedIdeaId(null);
        }}
      />
    );
  }

  return (
    <IdeaPanelList
      workId={selectedWorkId}
      activeTag={activeTag}
      onTagChange={setActiveTag}
      onSelect={(id) => {
        setSelectedIdeaId(id);
        setView('detail');
      }}
    />
  );
}

interface RawIdeaListRow {
  id: string;
  work_id: string;
  writer_id: string;
  content: string | null;
  tag: string | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
  encrypted_dek: string | null;
}

interface IdeaRow {
  id: string;
  content: string;
  tag: string | null;
  created_at: string;
  updated_at: string;
}

/** 아이디어 카드 정렬 키 */
type IdeaSortKey = 'default' | 'alpha' | 'created' | 'updated';

const SORT_LABEL: Record<IdeaSortKey, string> = {
  default: '기본',
  alpha: '가나다',
  created: '생성순',
  updated: '최근 변경순',
};

function IdeaPanelList({
  workId,
  activeTag,
  onTagChange,
  onSelect,
}: {
  workId: string;
  activeTag: string | null;
  onTagChange: (tag: string | null) => void;
  onSelect: (id: string) => void;
}) {
  const writerId = useWriterId();
  const { createIdea, deleteIdeaArchive, reorderItems } = useLocalWrite();
  const [inputText, setInputText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [searchText, setSearchText] = useState('');
  const [sortKey, setSortKey] = useState<IdeaSortKey>('default');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  // 카드 펼침 상태 — id 집합. 펼치면 line-clamp 해제, 전체 본문 노출.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const toggleExpand = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // content/tag는 v1: 암호문 → useDecryptedIdeaArchiveList 거쳐야 한다.
  const { data: rawRows = [] } = useQuery<RawIdeaListRow>(
    `SELECT i.id, i.work_id, i.writer_id, i.content, i.tag, i.sort_order,
            i.created_at, i.updated_at,
            w.encrypted_dek AS encrypted_dek
     FROM idea_archive i
     LEFT JOIN work w ON w.id = i.work_id
     WHERE i.work_id = ? AND i.writer_id = ?
     ORDER BY i.sort_order ASC, i.created_at DESC`,
    [workId, writerId],
  );
  const { data: decryptedRows } = useDecryptedIdeaArchiveList(rawRows);
  const ideas: IdeaRow[] = useMemo(
    () =>
      decryptedRows.map((r) => ({
        id: r.id,
        content: r.content,
        tag: r.tag,
        created_at: r.created_at,
        updated_at: r.updated_at,
      })),
    [decryptedRows],
  );

  const filteredIdeas = useMemo(() => {
    let result = activeTag ? ideas.filter((i) => i.tag === activeTag) : ideas;
    const query = searchText.trim().toLowerCase();
    if (query) {
      result = result.filter((i) =>
        extractText(i.content).toLowerCase().includes(query),
      );
    }
    if (sortKey === 'alpha') {
      result = [...result].sort((a, b) =>
        extractText(a.content).localeCompare(extractText(b.content), 'ko'),
      );
    } else if (sortKey === 'created') {
      // 최근 생성이 위로 — created_at DESC
      result = [...result].sort((a, b) =>
        (b.created_at ?? '').localeCompare(a.created_at ?? ''),
      );
    } else if (sortKey === 'updated') {
      // 최근 변경이 위로 — updated_at DESC
      result = [...result].sort((a, b) =>
        (b.updated_at ?? '').localeCompare(a.updated_at ?? ''),
      );
    }
    // 'default' 는 SQL 기본 (sort_order ASC, created_at DESC) 그대로
    return result;
  }, [ideas, activeTag, searchText, sortKey]);

  const handleSubmit = async () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;
    const content = textToTiptap(trimmed);
    // rawRows 는 unfiltered. MAX(sort_order)+1000 으로 항상 끝에 배치.
    const sortOrder =
      rawRows.length === 0
        ? 0
        : Math.max(...rawRows.map((r) => r.sort_order ?? 0)) + 1000;
    await createIdea(workId, content, activeTag, sortOrder);
    setInputText('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  // 기본 정렬 (sort_order ASC) 기준으로 이웃과 swap → 전체 reindex 로 일관성 보장.
  const handleMove = async (id: string, delta: -1 | 1) => {
    const idx = ideas.findIndex((i) => i.id === id);
    if (idx < 0) return;
    const target = idx + delta;
    if (target < 0 || target >= ideas.length) return;
    const reordered = [...ideas];
    const [moved] = reordered.splice(idx, 1);
    reordered.splice(target, 0, moved);
    await reorderItems(
      'idea_archive',
      reordered.map((it, i) => ({ id: it.id, sortOrder: i * 1000 })),
    );
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* 태그 필터 바 */}
      <div className="shrink-0 border-b border-border/50 px-2 py-1.5">
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
              activeTag === null
                ? 'bg-foreground/10 text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => onTagChange(null)}
          >
            전체
          </button>
          {TAG_LIST.map((tag) => (
            <button
              key={tag}
              type="button"
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
                activeTag === tag
                  ? TAG_COLOR[tag]
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => onTagChange(activeTag === tag ? null : tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* 리스트 검색 + 정렬 — 입력창 위에 위치 (필터 컨트롤이 작성 도구보다 먼저 노출) */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border/50 px-2 py-1.5">
        <div className="relative min-w-0 flex-1">
          <Search
            size={12}
            strokeWidth={2}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.currentTarget.value)}
            placeholder="아이디어 검색"
            className="h-7 w-full rounded-md border border-border bg-background pl-6 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <Popover
          align="end"
          width={150}
          trigger={
            <button
              type="button"
              title={`정렬: ${SORT_LABEL[sortKey]}`}
              aria-label="아이디어 정렬"
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background transition-colors hover:bg-accent hover:text-foreground',
                sortKey === 'default'
                  ? 'text-muted-foreground'
                  : 'text-primary',
              )}
            >
              {sortKey === 'alpha' ? (
                <ArrowDownAZ size={13} strokeWidth={1.75} />
              ) : (
                <ArrowUpDown size={13} strokeWidth={1.75} />
              )}
            </button>
          }
        >
          {(close) => (
            <div className="flex flex-col">
              {(Object.keys(SORT_LABEL) as IdeaSortKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setSortKey(key);
                    close();
                  }}
                  className={cn(
                    'flex items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground',
                    sortKey === key && 'text-primary',
                  )}
                >
                  <span>{SORT_LABEL[key]}</span>
                  {sortKey === key && <Check size={12} strokeWidth={2} />}
                </button>
              ))}
            </div>
          )}
        </Popover>
      </div>

      {/* 인라인 생성 입력 */}
      <div className="shrink-0 border-b border-border px-2 py-2">
        <div className="relative">
          <textarea
            ref={inputRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              activeTag
                ? `"${activeTag}" 아이디어… (Enter)`
                : '아이디어 메모… (Enter)'
            }
            rows={3}
            className="min-h-20 w-full resize-y rounded-md border border-border bg-background px-2.5 py-2 pr-8 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!inputText.trim()}
            className="absolute bottom-2 right-2 rounded p-0.5 text-muted-foreground transition-colors hover:text-primary disabled:opacity-30"
            title="등록 (Enter)"
          >
            <Send size={13} />
          </button>
        </div>
      </div>

      {/* 카드 리스트 */}
      <div className="flex-1 overflow-y-auto p-2">
        {filteredIdeas.length === 0 ? (
          ideas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Lightbulb className="mb-2 h-7 w-7 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">아직 아이디어가 없습니다</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground/60">위 입력란에 기록해보세요</p>
            </div>
          ) : (
            <p className="py-8 text-center text-xs text-muted-foreground">
              &ldquo;{activeTag}&rdquo; 태그의 아이디어가 없습니다
            </p>
          )
        ) : (
          <div className="flex flex-col gap-1.5">
            {filteredIdeas.map((idea) => {
              const expanded = expandedIds.has(idea.id);
              const fullText = extractText(idea.content) || '(빈 아이디어)';
              return (
              <ContextMenu key={idea.id}>
                <ContextMenuTrigger asChild>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect(idea.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect(idea.id);
                      }
                    }}
                    className="group relative flex cursor-pointer flex-col items-start rounded-md border border-border bg-background p-2.5 text-left transition-all hover:border-ring hover:shadow-sm focus:border-ring focus:outline-none"
                  >
                    <div className="mb-1 flex w-full items-center justify-between gap-1">
                      {idea.tag ? (
                        <span className={`rounded-full px-1.5 py-0 text-[10px] font-medium ${TAG_COLOR[idea.tag] ?? 'bg-muted'}`}>
                          {idea.tag}
                        </span>
                      ) : (
                        <span />
                      )}
                      <div className="flex items-center gap-1 shrink-0">
                        {idea.updated_at && (
                          <span className="text-[10px] text-muted-foreground">
                            {timeAgo(idea.updated_at)}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(idea.id);
                          }}
                          title={expanded ? '접기' : '펼치기'}
                          aria-label={expanded ? '아이디어 본문 접기' : '아이디어 본문 펼치기'}
                          aria-expanded={expanded}
                          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPendingDeleteId(idea.id);
                          }}
                          title="아이디어 삭제"
                          aria-label="아이디어 삭제"
                          className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus:opacity-100"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                    <p
                      className={cn(
                        'text-xs text-foreground',
                        expanded ? 'whitespace-pre-wrap' : 'line-clamp-2',
                      )}
                    >
                      {fullText}
                    </p>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onSelect={() => onSelect(idea.id)}>
                    <ArrowUpRight size={12} /> 열기
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    disabled={sortKey !== 'default' || ideas.findIndex((i) => i.id === idea.id) <= 0}
                    onSelect={() => void handleMove(idea.id, -1)}
                  >
                    <ChevronUp size={12} /> 위로 이동
                  </ContextMenuItem>
                  <ContextMenuItem
                    disabled={
                      sortKey !== 'default' ||
                      ideas.findIndex((i) => i.id === idea.id) < 0 ||
                      ideas.findIndex((i) => i.id === idea.id) >= ideas.length - 1
                    }
                    onSelect={() => void handleMove(idea.id, 1)}
                  >
                    <ChevronDown size={12} /> 아래로 이동
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    destructive
                    onSelect={() => setPendingDeleteId(idea.id)}
                  >
                    <Trash2 size={12} /> 삭제
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
              );
            })}
          </div>
        )}
      </div>

      {pendingDeleteId && (
        <DeleteConfirmDialog
          title="아이디어 삭제"
          message="이 아이디어가 영구 삭제됩니다."
          busy={deleteBusy}
          onConfirm={() => {
            setDeleteBusy(true);
            void Promise.resolve(deleteIdeaArchive(pendingDeleteId)).then(() => {
              setDeleteBusy(false);
              setPendingDeleteId(null);
            });
          }}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </div>
  );
}

interface RawIdeaDetailRow {
  id: string;
  work_id: string;
  writer_id: string;
  content: string | null;
  tag: string | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
  encrypted_dek: string | null;
}

function IdeaPanelDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { data: rows = [] } = useQuery<RawIdeaDetailRow>(
    `SELECT i.id, i.work_id, i.writer_id, i.content, i.tag, i.sort_order,
            i.created_at, i.updated_at,
            w.encrypted_dek AS encrypted_dek
     FROM idea_archive i
     LEFT JOIN work w ON w.id = i.work_id
     WHERE i.id = ? LIMIT 1`,
    [id],
  );
  const { data: decrypted } = useDecryptedIdeaArchiveList(rows);
  const { updateIdea, deleteIdeaArchive } = useLocalWrite();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const loaded = decrypted.length > 0;
  const idea = decrypted[0];

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* compact 헤더 */}
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1.5">
        <button
          type="button"
          onClick={onBack}
          title="목록으로"
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft size={13} />
        </button>
        <span className="flex-1 truncate text-xs font-medium text-foreground">아이디어</span>
        {idea?.tag && (
          <span className={`h-2 w-2 shrink-0 rounded-full ${TAG_DOT_COLOR[idea.tag] ?? ''}`} />
        )}
        <div className="w-20 shrink-0">
          <Select
            options={TAG_OPTIONS}
            value={idea?.tag ?? ''}
            onChange={(e) => void updateIdea(id, { tag: e.target.value || null })}
          />
        </div>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          title="아이디어 삭제"
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* 에디터 */}
      {!loaded ? (
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
          불러오는 중…
        </div>
      ) : (
        <ContentEditor
          key={id}
          itemId={id}
          initialContent={idea?.content ?? null}
          placeholder="떠오른 아이디어를 자유롭게 적어두세요…"
          onUpdate={(content) => void updateIdea(id, { content })}
          debounceMs={1500}
          showStatusBar={false}
          compact
          hideLineNumbers
        />
      )}

      {confirmDelete && (
        <DeleteConfirmDialog
          title="아이디어 삭제"
          message="이 아이디어가 영구 삭제됩니다."
          busy={deleteBusy}
          onConfirm={() => {
            setDeleteBusy(true);
            void deleteIdeaArchive(id).then(() => {
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

