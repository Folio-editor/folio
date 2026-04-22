import { useRef, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@powersync/react';
import { Check, Lightbulb, Pencil, Send, Trash2, X } from 'lucide-react';
import { useWriterId } from '../../hooks/useWriterId';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { MainPanelHeader } from '../../components/layout/MainPanelHeader';
import { DeleteConfirmDialog } from '../../components/ui/DeleteConfirmDialog';
import { TAG_LIST, TAG_COLOR } from './ideaConstants';
import { extractText, textToTiptap, timeAgo } from './ideaUtils';

interface IdeaArchiveListScreenProps {
  workId: string;
  onSelect: (id: string) => void;
}

interface IdeaRow {
  id: string;
  content: string;
  tag: string | null;
  sort_order: number;
  updated_at: string;
}

export function IdeaArchiveListScreen({ workId, onSelect }: IdeaArchiveListScreenProps) {
  const writerId = useWriterId();
  const { createIdea, updateIdea, deleteIdeaArchive } = useLocalWrite();
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [editingIdeaId, setEditingIdeaId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: ideas = [] } = useQuery<IdeaRow>(
    `SELECT id, content, tag, sort_order, updated_at FROM idea_archive
     WHERE work_id = ? AND writer_id = ?
     ORDER BY sort_order ASC, created_at DESC`,
    [workId, writerId],
  );

  const filteredIdeas = activeTag ? ideas.filter((idea) => idea.tag === activeTag) : ideas;

  const handleSubmit = async () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;
    const topSortOrder =
      ideas.length > 0
        ? Math.min(...ideas.map((idea) => idea.sort_order ?? 0)) - 1000
        : 0;
    await createIdea(workId, textToTiptap(trimmed), activeTag, topSortOrder);
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

  const startEditing = (idea: IdeaRow, plainText: string) => {
    setEditingIdeaId(idea.id);
    setEditText(plainText === '(빈 아이디어)' ? '' : plainText);
  };

  const handleSaveEdit = async (id: string) => {
    const trimmed = editText.trim();
    if (!trimmed) return;
    await updateIdea(id, { content: textToTiptap(trimmed) });
    setEditingIdeaId(null);
    setEditText('');
  };

  const handleCancelEdit = () => {
    setEditingIdeaId(null);
    setEditText('');
  };

  return (
    <div className="flex h-full flex-col">
      <MainPanelHeader
        title={<h2 className="text-lg font-semibold">아이디어</h2>}
        subtitle="영감과 좋은 문장을 빠르게 모아둡니다"
      />

      <div className="shrink-0 border-b border-border/50 bg-muted/30 px-6 py-2">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              activeTag === null
                ? 'bg-foreground/10 text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTag(null)}
          >
            전체
          </button>
          {TAG_LIST.map((tag) => (
            <button
              key={tag}
              type="button"
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                activeTag === tag
                  ? TAG_COLOR[tag]
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      <div className="shrink-0 border-b border-border px-6 py-4">
        <div className="relative rounded-xl border border-primary/25 bg-primary/[0.03] p-3 shadow-sm transition-colors focus-within:border-primary/45 focus-within:bg-background">
          <div className="mb-2 flex items-center gap-3">
            <span className="text-xs font-semibold text-primary">새 아이디어</span>
          </div>
          <textarea
            ref={inputRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              activeTag
                ? `"${activeTag}" 아이디어를 입력하고 Enter를 눌러주세요`
                : '아이디어를 입력하고 Enter를 눌러주세요'
            }
            rows={2}
            className="min-h-20 w-full resize-none rounded-lg border border-border/70 bg-background px-4 py-3 pr-12 text-sm text-foreground shadow-inner placeholder:text-muted-foreground/80 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/10"
          />
          {activeTag && !inputText && (
            <span
              className={`pointer-events-none absolute left-7 top-[5.4rem] rounded-full px-2 py-0.5 text-[10px] ${TAG_COLOR[activeTag]}`}
            >
              {activeTag}
            </span>
          )}
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!inputText.trim()}
            className="absolute bottom-6 right-6 rounded-md bg-primary px-2.5 py-2 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70"
            title="등록 (Enter)"
          >
            <Send size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {filteredIdeas.length === 0 ? (
          ideas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Lightbulb className="mb-4 h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm font-medium text-muted-foreground">
                아직 아이디어가 없습니다
              </p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                떠오르는 장면, 대사, 문장을 가볍게 기록해보세요
              </p>
            </div>
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">
              &ldquo;{activeTag}&rdquo; 태그의 아이디어가 없습니다
            </p>
          )
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredIdeas.map((idea) => {
              const plainText = extractText(idea.content) || '(빈 아이디어)';
              const previewText = truncateIdeaPreview(plainText);
              const isEditing = editingIdeaId === idea.id;

              return (
                <div
                  key={idea.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (!isEditing) onSelect(idea.id);
                  }}
                  onKeyDown={(e) => {
                    if (!isEditing && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      onSelect(idea.id);
                    }
                  }}
                  className="group relative flex h-[168px] cursor-pointer flex-col rounded-lg border border-border bg-background px-5 py-5 text-left transition-all hover:border-ring hover:shadow-md"
                >
                  {!isEditing ? (
                    <>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditing(idea, plainText);
                        }}
                        title="수정"
                        className="absolute right-10 top-4 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-primary group-hover:opacity-100"
                      >
                        <Pencil size={14} strokeWidth={1.75} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget({ id: idea.id, label: plainText });
                        }}
                        title="삭제"
                        className="absolute right-4 top-4 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                      >
                        <Trash2 size={14} strokeWidth={1.75} />
                      </button>
                    </>
                  ) : (
                    <div className="absolute bottom-5 right-5 z-10 flex gap-1 rounded-md bg-background/90 shadow-sm">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCancelEdit();
                        }}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="취소"
                      >
                        <X size={14} strokeWidth={1.75} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleSaveEdit(idea.id);
                        }}
                        disabled={!editText.trim()}
                        className="rounded bg-primary p-1 text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
                        title="저장"
                      >
                        <Check size={14} strokeWidth={1.75} />
                      </button>
                    </div>
                  )}

                  <div className="flex min-h-0 w-full flex-1 flex-col px-2">
                    {idea.tag && (
                      <span
                        className={`mb-3 w-fit rounded-full px-2 py-0.5 text-xs ${TAG_COLOR[idea.tag] ?? 'bg-muted'}`}
                      >
                        {idea.tag}
                      </span>
                    )}

                    {isEditing ? (
                      <textarea
                        autoFocus
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.nativeEvent.isComposing) return;
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            handleCancelEdit();
                          }
                          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                            e.preventDefault();
                            void handleSaveEdit(idea.id);
                          }
                        }}
                        rows={3}
                        className={`resize-none rounded-md border border-ring bg-transparent px-2 py-0 text-sm leading-7 text-foreground outline-none ring-1 ring-ring ${
                          idea.tag ? 'h-16' : 'h-[92px]'
                        }`}
                      />
                    ) : (
                      <p
                        className="text-sm leading-7 text-foreground [overflow-wrap:anywhere]"
                        style={{
                          display: '-webkit-box',
                          WebkitBoxOrient: 'vertical',
                          WebkitLineClamp: 4,
                          overflow: 'hidden',
                        }}
                      >
                        {previewText}
                      </p>
                    )}

                    {!isEditing && idea.updated_at && (
                      <span className="mt-auto self-end pt-4 text-xs text-muted-foreground">
                        {timeAgo(idea.updated_at)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {deleteTarget && (
        <DeleteConfirmDialog
          title="아이디어 삭제"
          message={`"${deleteTarget.label}" 아이디어를 삭제합니다.`}
          warning="이 작업은 되돌릴 수 없습니다."
          confirmLabel="삭제"
          busyLabel="삭제 중..."
          busy={deleteBusy}
          onConfirm={() => {
            setDeleteBusy(true);
            void deleteIdeaArchive(deleteTarget.id).then(() => {
              setDeleteTarget(null);
              setDeleteBusy(false);
            });
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function truncateIdeaPreview(text: string): string {
  const maxVisualWidth = 72;
  let visualWidth = 0;
  let result = '';

  for (const char of text) {
    const nextWidth = visualWidth + getPreviewCharWidth(char);
    if (nextWidth > maxVisualWidth) {
      return `${result.trimEnd()}...`;
    }
    visualWidth = nextWidth;
    result += char;
  }

  return text;
}

function getPreviewCharWidth(char: string): number {
  return /[^\u0000-\u00ff]/.test(char) ? 2 : 1;
}
