import { useEffect } from 'react';
import { useQuery } from '@powersync/react';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { useDeferredText } from '../../hooks/useDeferredText';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { IconButton } from '../../components/ui/IconButton';
import { MainPanelHeader } from '../../components/layout/MainPanelHeader';

interface CharacterOverviewProps {
  characterId: string;
  onBack: () => void;
  onNoteSelect: (noteId: string) => void;
}

interface CharacterRow {
  id: string;
  name: string;
  gender: string;
  age: string;
}

interface NoteSummaryRow {
  id: string;
  kind: string;
  title: string;
  content: string | null;
}

const GENDER_OPTIONS = [
  { value: '미설정', label: '미설정' },
  { value: '남', label: '남' },
  { value: '여', label: '여' },
  { value: '기타', label: '기타' },
];

export function CharacterOverview({
  characterId,
  onBack,
  onNoteSelect,
}: CharacterOverviewProps) {
  const { ensureCharacterNotes } = useLocalWrite();

  const { data: rows = [] } = useQuery<CharacterRow>(
    `SELECT id, name, gender, age FROM character WHERE id = ?`,
    [characterId],
  );
  const character = rows[0];

  useEffect(() => {
    void ensureCharacterNotes(characterId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId]);

  if (!character) {
    return <div className="p-8 text-sm text-muted-foreground">캐릭터를 불러오는 중…</div>;
  }

  return (
    <CharacterOverviewInner
      key={characterId}
      character={character}
      onBack={onBack}
      onNoteSelect={onNoteSelect}
    />
  );
}

function CharacterOverviewInner({
  character,
  onBack,
  onNoteSelect,
}: {
  character: CharacterRow;
  onBack: () => void;
  onNoteSelect: (id: string) => void;
}) {
  const { updateCharacter } = useLocalWrite();
  const { id } = character;

  const name = useDeferredText(id, character.name, (v) =>
    void updateCharacter(id, { name: v }),
  );
  const age = useDeferredText(id, character.age, (v) =>
    void updateCharacter(id, { age: v }),
  );

  const { data: notes = [] } = useQuery<NoteSummaryRow>(
    `SELECT id, kind, title, content FROM character_note
     WHERE character_id = ?
     ORDER BY sort_order ASC, created_at ASC`,
    [id],
  );

  return (
    <div className="flex h-full flex-col">
      <MainPanelHeader
        leading={<IconButton onClick={onBack} title="목록으로">←</IconButton>}
        title={
          <Input
            value={name.value}
            onChange={(e) => name.onChange(e.target.value)}
            onBlur={name.onBlur}
            placeholder="이름"
            className="border-none px-0 text-base font-medium shadow-none focus-visible:ring-0"
          />
        }
        meta={
          <div className="flex items-center gap-4">
            <label className="text-xs text-muted-foreground">성별</label>
            <Select
              options={GENDER_OPTIONS}
              value={character.gender}
              onChange={(e) => void updateCharacter(id, { gender: e.target.value })}
              className="w-24"
            />
            <label className="text-xs text-muted-foreground">나이</label>
            <input
              type="text"
              value={age.value}
              onChange={(e) => age.onChange(e.target.value)}
              onBlur={age.onBlur}
              placeholder="예: 25세"
              className="w-32 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
        }
      />

      {/* 하위 문서 요약 카드 */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          문서
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onClick={() => onNoteSelect(note.id)}
            />
          ))}
        </div>
        {notes.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            문서가 없습니다.
          </p>
        )}
      </div>
    </div>
  );
}

/* ── 하위 문서 요약 카드 ── */

const KIND_ICONS: Record<string, string> = {
  appearance: '👤',
  personality: '💭',
  custom: '📄',
};

function NoteCard({
  note,
  onClick,
}: {
  note: NoteSummaryRow;
  onClick: () => void;
}) {
  const preview = extractPreview(note.content, 80);
  const icon = KIND_ICONS[note.kind] ?? KIND_ICONS.custom;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start rounded-lg border border-border bg-background p-4 text-left transition-colors hover:border-ring hover:bg-primary/5"
    >
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <span className="text-sm font-medium text-foreground">
          {note.title?.trim() || '(제목 없음)'}
        </span>
      </div>
      {preview ? (
        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
          {preview}
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground/50">
          아직 작성된 내용이 없습니다.
        </p>
      )}
    </button>
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
    return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
  } catch {
    return raw.length > maxLen ? raw.slice(0, maxLen) + '…' : raw;
  }
}

function collectText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as { text?: string; content?: unknown[] };
  if (typeof n.text === 'string') return n.text;
  if (Array.isArray(n.content)) return n.content.map(collectText).join('');
  return '';
}
