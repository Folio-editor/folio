import { useRef, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@powersync/react';
import { Lightbulb, Send } from 'lucide-react';
import { useWriterId } from '../../hooks/useWriterId';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { MainPanelHeader } from '../../components/layout/MainPanelHeader';

interface IdeaArchiveListScreenProps {
  workId: string;
  onSelect: (id: string) => void;
}

interface IdeaRow {
  id: string;
  content: string;
  tag: string | null;
  updated_at: string;
}

const TAG_LIST = ['문장', '장면', '설정', '반전', '대사'] as const;

const TAG_COLOR: Record<string, string> = {
  '문장': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  '장면': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  '설정': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  '반전': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  '대사': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

function timeAgo(iso: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  const months = Math.floor(days / 30);
  return `${months}개월 전`;
}

function textToTiptap(text: string): string {
  return JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });
}

export function IdeaArchiveListScreen({ workId, onSelect }: IdeaArchiveListScreenProps) {
  const writerId = useWriterId();
  const { createIdea } = useLocalWrite();
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: ideas = [] } = useQuery<IdeaRow>(
    `SELECT id, content, tag, updated_at FROM idea_archive
     WHERE work_id = ? AND writer_id = ?
     ORDER BY sort_order ASC, created_at DESC`,
    [workId, writerId],
  );

  const filteredIdeas = activeTag ? ideas.filter((i) => i.tag === activeTag) : ideas;

  const handleSubmit = async () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;
    const content = textToTiptap(trimmed);
    await createIdea(workId, content, activeTag, ideas.length);
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
        subtitle="영감과 좋은 문장을 저장합니다"
      />

      {/* 태그 필터 바 */}
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

      {/* 입력 바 — 필터 바 바로 아래 */}
      <div className="shrink-0 border-b border-border px-6 py-3">
        <div className="relative">
          <textarea
            ref={inputRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              activeTag
                ? `"${activeTag}" 아이디어를 입력하고 Enter…`
                : '아이디어를 입력하고 Enter…'
            }
            rows={2}
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {activeTag && (
            <span
              className={`absolute left-3 top-2.5 rounded-full px-2 py-0.5 text-[10px] ${TAG_COLOR[activeTag]} pointer-events-none`}
              style={{ transform: inputText ? 'scale(0)' : 'scale(1)', transition: 'transform 0.15s' }}
            >
              {activeTag}
            </span>
          )}
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!inputText.trim()}
            className="absolute bottom-3 right-3 rounded p-1 text-muted-foreground transition-colors hover:text-primary disabled:opacity-30"
            title="등록 (Enter)"
          >
            <Send size={16} />
          </button>
        </div>
      </div>

      {/* 카드 그리드 */}
      <div className="flex-1 overflow-y-auto p-6">
        {filteredIdeas.length === 0 ? (
          ideas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Lightbulb className="mb-4 h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm font-medium text-muted-foreground">
                아직 아이디어가 없습니다
              </p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                위 입력란에 떠오르는 영감을 기록해보세요
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

function extractText(raw: string): string {
  if (!raw) return '';
  try {
    const json = JSON.parse(raw);
    return collectText(json).trim();
  } catch {
    return raw;
  }
}

function collectText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as { text?: string; content?: unknown[] };
  if (typeof n.text === 'string') return n.text;
  if (Array.isArray(n.content)) return n.content.map(collectText).join(' ');
  return '';
}
