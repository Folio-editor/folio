import { useQuery } from '@powersync/react';
import { useWriterId } from '../../hooks/useWriterId';
import { MainPanelHeader } from '../../components/layout/MainPanelHeader';

interface WorldNoteOverviewProps {
  workId: string;
  onNoteSelect: (id: string) => void;
}

interface NoteRow {
  id: string;
  name: string;
  content: string | null;
}

/**
 * 세계관 탭 선택 시 노트가 미선택된 상태에서 보이는 개요 화면.
 * 루트 노트들을 카드 그리드로 표시한다.
 */
export function WorldNoteOverview({ workId, onNoteSelect }: WorldNoteOverviewProps) {
  const writerId = useWriterId();

  const { data: notes = [] } = useQuery<NoteRow>(
    `SELECT id, name, content FROM world_note
     WHERE work_id = ? AND writer_id = ? AND parent_id IS NULL
     ORDER BY sort_order ASC, created_at ASC`,
    [workId, writerId],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MainPanelHeader
        title={<span className="text-lg font-semibold">세계관</span>}
        subtitle="작품의 배경과 설정을 관리합니다"
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {notes.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            좌측 사이드바에서 문서를 선택하거나 추가하세요.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {notes.map((note) => {
              const preview = extractPreview(note.content, 60);
              return (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => onNoteSelect(note.id)}
                  className="rounded-lg border border-border bg-background p-4 text-left transition-colors hover:border-ring hover:bg-primary/5"
                >
                  <span className="text-sm font-medium text-foreground">
                    {note.name?.trim() || '(이름 없음)'}
                  </span>
                  {preview ? (
                    <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
                      {preview}
                    </p>
                  ) : (
                    <p className="mt-1.5 text-xs text-muted-foreground/50">
                      내용 없음
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * TipTap JSON에서 텍스트만 추출하여 미리보기 생성.
 */
function extractPreview(raw: string | null, maxLen: number): string {
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    const text = collectText(parsed);
    return text.length > maxLen ? text.slice(0, maxLen) + '\u2026' : text;
  } catch {
    return raw.length > maxLen ? raw.slice(0, maxLen) + '\u2026' : raw;
  }
}

function collectText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as { text?: string; content?: unknown[] };
  if (typeof n.text === 'string') return n.text;
  if (Array.isArray(n.content)) return n.content.map(collectText).join('');
  return '';
}
