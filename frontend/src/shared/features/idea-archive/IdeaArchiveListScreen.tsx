import { useRef, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@powersync/react';
import { Lightbulb, Send } from 'lucide-react';
import { useWriterId } from '../../hooks/useWriterId';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { MainPanelHeader } from '../../components/layout/MainPanelHeader';
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
  const { createIdea } = useLocalWrite();
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
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
            {filteredIdeas.map((idea) => (
              <button
                key={idea.id}
                type="button"
                onClick={() => onSelect(idea.id)}
                className="flex flex-col items-start rounded-lg border border-border bg-background p-4 text-left transition-all hover:border-ring hover:shadow-md"
              >
                {idea.tag && (
                  <span
                    className={`mb-2 rounded-full px-2 py-0.5 text-xs ${TAG_COLOR[idea.tag] ?? 'bg-muted'}`}
                  >
                    {idea.tag}
                  </span>
                )}
                <p className="line-clamp-4 text-sm text-foreground">
                  {extractText(idea.content) || '(빈 아이디어)'}
                </p>
                {idea.updated_at && (
                  <span className="mt-3 self-end text-xs text-muted-foreground">
                    {timeAgo(idea.updated_at)}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
