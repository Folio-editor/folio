import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@powersync/react';
import { generateHTML } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import { LayoutGrid, List, Trash2 } from 'lucide-react';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { useWriterId } from '../../hooks/useWriterId';
import { useDeferredText } from '../../hooks/useDeferredText';
import { DeleteConfirmDialog } from '../../components/ui/DeleteConfirmDialog';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { IconButton } from '../../components/ui/IconButton';
import { MainPanelHeader } from '../../components/layout/MainPanelHeader';
import { cn } from '../../lib/cn';

/** generateHTML용 최소 확장 세트 (에디터 전체 확장 불필요, 렌더링용) */
const previewExtensions = [
  StarterKit.configure({ code: false, codeBlock: false }),
  Underline,
  Highlight.configure({ multicolor: false }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
];

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
  work_id: string;
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
    `SELECT id, name, gender, age, work_id FROM character WHERE id = ?`,
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
  const { updateCharacter, createCharacterTag, deleteCharacterTag, deleteCharacter } = useLocalWrite();
  const writerId = useWriterId();
  const { id } = character;

  const name = useDeferredText(id, character.name, (v) =>
    void updateCharacter(id, { name: v }),
  );
  const age = useDeferredText(id, character.age, (v) =>
    void updateCharacter(id, { age: v }),
  );

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const { data: notes = [] } = useQuery<NoteSummaryRow>(
    `SELECT id, kind, title, content FROM character_note
     WHERE character_id = ?
     ORDER BY sort_order ASC, created_at ASC`,
    [id],
  );

  const { data: tags = [] } = useQuery<{ world_note_id: string; name: string }>(
    `SELECT ct.world_note_id, wn.name
     FROM character_tag ct
     JOIN world_note wn ON ct.world_note_id = wn.id
     WHERE ct.character_id = ?
     ORDER BY wn.name ASC`,
    [id],
  );

  const { data: availableNotes = [] } = useQuery<{ id: string; name: string; parent_id: string | null }>(
    tagPickerOpen
      ? `SELECT id, name, parent_id FROM world_note WHERE work_id = ? AND writer_id = ? ORDER BY sort_order ASC, name ASC`
      : `SELECT '' AS id, '' AS name, NULL AS parent_id WHERE 0`,
    tagPickerOpen ? [character.work_id, writerId] : [],
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
        trailing={
          <div className="flex items-center gap-2">
            <ViewToggle mode={viewMode} onChange={setViewMode} />
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              title="캐릭터 삭제"
              className="rounded p-2 text-muted-foreground hover:bg-destructive/5 hover:text-destructive"
            >
              <Trash2 size={16} strokeWidth={1.75} />
            </button>
          </div>
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

      {/* 하위 문서 */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {/* 태그 */}
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">태그</h3>
            <button
              type="button"
              onClick={() => setTagPickerOpen((v) => !v)}
              className="rounded-md px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
            >
              + 태그
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {tags.length === 0 && (
              <span className="text-xs text-muted-foreground/50">태그 없음</span>
            )}
            {tags.map((tag) => (
              <span
                key={tag.world_note_id}
                className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
              >
                {tag.name}
                <button
                  type="button"
                  onClick={() => void deleteCharacterTag(id, tag.world_note_id)}
                  className="text-primary/60 hover:text-primary"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          {tagPickerOpen && (
            <TagPicker
              availableNotes={availableNotes}
              existingTagIds={tags.map((t) => t.world_note_id)}
              onSelect={(worldNoteId) => {
                void createCharacterTag(id, worldNoteId);
                setTagPickerOpen(false);
              }}
              onClose={() => setTagPickerOpen(false)}
            />
          )}
        </div>

        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          문서
        </h3>
        {notes.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            문서가 없습니다.
          </p>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {notes.map((note) => (
              <NoteCard key={note.id} note={note} onClick={() => onNoteSelect(note.id)} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {notes.map((note) => (
              <NoteListItem key={note.id} note={note} onClick={() => onNoteSelect(note.id)} />
            ))}
          </div>
        )}
      </div>

      {confirmDelete && (
        <DeleteConfirmDialog
          title="캐릭터 삭제"
          message={`"${character.name}" 캐릭터와 관련 문서가 영구 삭제됩니다.`}
          busy={deleteBusy}
          onConfirm={() => {
            setDeleteBusy(true);
            void deleteCharacter(id).then(() => {
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
  const icon = KIND_ICONS[note.kind] ?? KIND_ICONS.custom;
  const previewHtml = useMemo(() => contentToHtml(note.content), [note.content]);

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
      {previewHtml ? (
        <div
          className="note-preview mt-2 line-clamp-4 text-xs text-muted-foreground"
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      ) : (
        <p className="mt-2 text-xs text-muted-foreground/50">
          아직 작성된 내용이 없습니다.
        </p>
      )}
    </button>
  );
}

/** TipTap JSON → HTML 변환 (서식 유지) */
function contentToHtml(raw: string | null): string {
  if (!raw) return '';
  try {
    const json = JSON.parse(raw);
    return generateHTML(json, previewExtensions);
  } catch {
    return '';
  }
}

/* ── 뷰 모드 토글 ── */

function ViewToggle({
  mode,
  onChange,
}: {
  mode: 'grid' | 'list';
  onChange: (mode: 'grid' | 'list') => void;
}) {
  return (
    <div className="flex items-center rounded-md border border-border">
      <button
        type="button"
        onClick={() => onChange('grid')}
        title="그리드 보기"
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-l-md transition-colors',
          mode === 'grid'
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <LayoutGrid size={14} />
      </button>
      <button
        type="button"
        onClick={() => onChange('list')}
        title="리스트 보기"
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-r-md transition-colors',
          mode === 'list'
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <List size={14} />
      </button>
    </div>
  );
}

/* ── 태그 선택기 ── */

function TagPicker({
  availableNotes,
  existingTagIds,
  onSelect,
  onClose,
}: {
  availableNotes: { id: string; name: string; parent_id: string | null }[];
  existingTagIds: string[];
  onSelect: (worldNoteId: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');

  const filtered = availableNotes.filter(
    (n) =>
      !existingTagIds.includes(n.id) &&
      n.name.toLowerCase().includes(search.toLowerCase()),
  );

  const parentMap = new Map(availableNotes.map((n) => [n.id, n.name]));

  return (
    <>
      {/* click-away backdrop */}
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="relative z-20 mt-2 rounded-lg border border-border bg-popover p-2 shadow-lg">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="세계관 문서 검색…"
          autoFocus
          className="mb-2 w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none placeholder:text-muted-foreground focus:border-ring"
        />
        <div className="max-h-40 overflow-y-auto">
          {filtered.map((note) => (
            <button
              key={note.id}
              type="button"
              onClick={() => onSelect(note.id)}
              className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent"
            >
              {note.parent_id && parentMap.get(note.parent_id) && (
                <span className="mr-1 text-muted-foreground">
                  {parentMap.get(note.parent_id)} &gt;{' '}
                </span>
              )}
              {note.name}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              태그할 세계관 문서가 없습니다
            </p>
          )}
        </div>
      </div>
    </>
  );
}

/* ── 리스트 뷰 항목 ── */

function NoteListItem({
  note,
  onClick,
}: {
  note: NoteSummaryRow;
  onClick: () => void;
}) {
  const icon = KIND_ICONS[note.kind] ?? KIND_ICONS.custom;
  const previewHtml = useMemo(() => contentToHtml(note.content), [note.content]);

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-md border border-border bg-background px-4 py-3 text-left transition-colors hover:border-ring hover:bg-primary/5"
    >
      <span className="shrink-0 text-lg">{icon}</span>
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-foreground">
          {note.title?.trim() || '(제목 없음)'}
        </span>
        {previewHtml ? (
          <div
            className="note-preview mt-0.5 line-clamp-1 text-xs text-muted-foreground"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        ) : (
          <p className="mt-0.5 text-xs text-muted-foreground/50">내용 없음</p>
        )}
      </div>
    </button>
  );
}
