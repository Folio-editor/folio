import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@powersync/react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import { Camera, Check, Plus, Trash2, X } from 'lucide-react';
import { IconGenderMale, IconGenderFemale, IconGenderBigender, IconQuestionMark } from '@tabler/icons-react';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { resizeImageToBase64 } from '../../lib/imageResize';
import { useWriterId } from '../../hooks/useWriterId';
import { useDeferredText } from '../../hooks/useDeferredText';
import { DeleteConfirmDialog } from '../../components/ui/DeleteConfirmDialog';
import { Input } from '../../components/ui/Input';
import { IconButton } from '../../components/ui/IconButton';
import { MainPanelHeader } from '../../components/layout/MainPanelHeader';
import { cn } from '../../lib/cn';


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
  profile_image_url: string | null;
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

const GENDER_ICON_STYLE: Record<string, { color: string }> = {
  '미설정': { color: 'text-muted-foreground' },
  '남': { color: 'text-blue-500' },
  '여': { color: 'text-pink-500' },
  '기타': { color: 'text-violet-500' },
};

const GENDER_ICON_MAP: Record<string, React.ComponentType<{ size: number; stroke: number; className?: string }>> = {
  '남': IconGenderMale,
  '여': IconGenderFemale,
  '기타': IconGenderBigender,
  '미설정': IconQuestionMark,
};

function GenderIcon({ gender, size = 18 }: { gender: string; size?: number }) {
  const style = GENDER_ICON_STYLE[gender] ?? GENDER_ICON_STYLE['미설정'];
  const Icon = GENDER_ICON_MAP[gender] ?? IconQuestionMark;
  return <Icon size={size} stroke={1.75} className={style.color} />;
}

function GenderPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={`성별: ${value}`}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background transition-colors hover:bg-muted"
      >
        <GenderIcon gender={value} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-32 overflow-hidden rounded-lg border border-border bg-background p-1 shadow-lg">
          {GENDER_OPTIONS.map((opt) => {
            const selected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted',
                  selected && 'bg-muted font-medium',
                )}
              >
                <GenderIcon gender={opt.value} size={16} />
                <span className="flex-1 text-foreground">{opt.label}</span>
                {selected && <Check size={14} strokeWidth={2} className="text-muted-foreground" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function CharacterOverview({
  characterId,
  onBack,
  onNoteSelect,
}: CharacterOverviewProps) {
  const { ensureCharacterNotes } = useLocalWrite();

  const { data: rows = [] } = useQuery<CharacterRow>(
    `SELECT id, name, gender, age, profile_image_url, work_id FROM character WHERE id = ?`,
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
  const { updateCharacter, createCharacterTag, deleteCharacterTag, deleteCharacter, createCharacterNote } = useLocalWrite();
  const writerId = useWriterId();
  const { id } = character;

  const name = useDeferredText(id, character.name, (v) =>
    void updateCharacter(id, { name: v }),
  );
  const age = useDeferredText(id, character.age, (v) =>
    void updateCharacter(id, { age: v }),
  );

  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const base64 = await resizeImageToBase64(file);
    void updateCharacter(id, { profile_image_url: base64 });
    e.target.value = '';
  };
  const handleImageRemove = () => {
    void updateCharacter(id, { profile_image_url: null });
  };

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
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            title="캐릭터 삭제"
            className="rounded p-2 text-muted-foreground hover:bg-destructive/5 hover:text-destructive"
          >
            <Trash2 size={16} strokeWidth={1.75} />
          </button>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-8 py-6">
        {/* ── 프로필 카드 (이력서 스타일) ── */}
        <div className="mb-6 flex gap-6">
          {/* 프로필 이미지 */}
          <div className="group/img relative shrink-0">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="프로필 이미지 변경"
              className="relative flex h-40 w-36 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted transition-colors hover:border-ring"
            >
              {character.profile_image_url ? (
                <img
                  src={character.profile_image_url}
                  alt={character.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-4xl font-bold text-muted-foreground/30">
                  {character.name.charAt(0) || '?'}
                </span>
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover/img:bg-black/40">
                <Camera size={22} className="text-white opacity-0 transition-opacity group-hover/img:opacity-100" />
              </div>
            </button>
            {character.profile_image_url && (
              <button
                type="button"
                onClick={handleImageRemove}
                title="이미지 제거"
                className="absolute right-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover/img:opacity-100 hover:bg-black/70"
              >
                <X size={11} strokeWidth={2.5} />
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => void handleImageChange(e)}
              className="hidden"
            />
          </div>

          {/* 기본 정보 */}
          <div className="flex flex-1 flex-col gap-3 pt-1">
            {/* 성별 아이콘 + 이름 (크게) + 나이 */}
            <div className="flex items-baseline gap-2 flex-wrap">
              <GenderPicker
                value={character.gender}
                onChange={(v) => void updateCharacter(id, { gender: v })}
              />
              <input
                value={name.value}
                onChange={(e) => name.onChange(e.target.value)}
                onBlur={name.onBlur}
                placeholder="이름"
                className="border-none bg-transparent text-2xl font-bold text-foreground outline-none placeholder:text-muted-foreground/40"
                style={{ width: `${Math.max(name.value.length * 1.8, 4)}ch` }}
              />
              <span className="text-lg text-muted-foreground/40 select-none">/</span>
              <input
                type="text"
                value={age.value}
                onChange={(e) => age.onChange(e.target.value)}
                onBlur={age.onBlur}
                placeholder="나이"
                className="border-none bg-transparent text-base text-muted-foreground outline-none placeholder:text-muted-foreground/40"
                style={{ width: `${Math.max(age.value.length * 1.8, 4)}ch` }}
              />
            </div>

            {/* 태그 */}
            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">태그</span>
                <button
                  type="button"
                  onClick={() => setTagPickerOpen((v) => !v)}
                  className="flex h-5 w-5 items-center justify-center rounded border border-dashed border-border text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
                >
                  <span className="text-xs leading-none">+</span>
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {tags.length === 0 && (
                  <span className="text-xs text-muted-foreground/40">태그 없음</span>
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
          </div>
        </div>

        {/* ── 하위 문서 ── */}
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            하위 문서
          </h3>
          <button
            type="button"
            onClick={() => void createCharacterNote(id, '새 문서', notes.length)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Plus size={12} />
            추가
          </button>
        </div>

        {notes.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            문서가 없습니다.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {notes.map((note) => (
              <InlineNoteItem key={note.id} note={note} onNavigate={() => onNoteSelect(note.id)} />
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

/* ── 하위 문서 인라인 편집 항목 ── */

const KIND_ICONS: Record<string, string> = {
  custom: '📄',
};

function InlineNoteItem({
  note,
  onNavigate,
}: {
  note: NoteSummaryRow;
  onNavigate: () => void;
}) {
  const { updateCharacterNoteTitle, updateCharacterNoteContent, deleteCharacterNote } = useLocalWrite();
  const icon = KIND_ICONS[note.kind];

  const title = useDeferredText(note.id, note.title, (v) =>
    void updateCharacterNoteTitle(note.id, v),
  );

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onUpdateRef = useRef(updateCharacterNoteContent);
  onUpdateRef.current = updateCharacterNoteContent;

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({ code: false, codeBlock: false }),
        Placeholder.configure({ placeholder: '내용을 입력하세요…' }),
        Highlight.configure({ multicolor: false }),
      ],
      content: parseNoteContent(note.content),
      onUpdate: ({ editor: ed }) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          const json = JSON.stringify(ed.getJSON());
          void onUpdateRef.current(note.id, json);
        }, 800);
      },
    },
    [],
  );

  // noteId 변경 시 콘텐츠 교체
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (!editor || editor.isDestroyed) return;
    editor.commands.setContent(parseNoteContent(note.content), { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="group py-4">
      {/* 제목 행 */}
      <div className="mb-2 flex items-center gap-2">
        {icon && <span className="shrink-0 text-base">{icon}</span>}
        <input
          type="text"
          value={title.value}
          onChange={(e) => title.onChange(e.target.value)}
          onBlur={title.onBlur}
          placeholder="제목"
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-foreground outline-none placeholder:text-muted-foreground/40"
        />
        <button
          type="button"
          onClick={onNavigate}
          title="에디터에서 편집"
          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
        >
          상세 편집
        </button>
        {note.kind === 'custom' && (
          <button
            type="button"
            onClick={() => void deleteCharacterNote(note.id)}
            title="문서 삭제"
            className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
      {/* 본문 인라인 위지윅 에디터 */}
      <div className={icon ? 'pl-7' : ''}>
        <EditorContent
          editor={editor}
          className="inline-note-editor prose prose-sm max-w-none text-xs leading-relaxed text-foreground/80 [&_.tiptap]:outline-none [&_.tiptap_p.is-editor-empty:first-child::before]:text-muted-foreground/40 [&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.tiptap_p.is-editor-empty:first-child::before]:float-left [&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none [&_.tiptap_p.is-editor-empty:first-child::before]:h-0"
        />
      </div>
    </div>
  );
}

function parseNoteContent(raw: string | null): object | string {
  if (!raw) return '';
  try {
    return JSON.parse(raw) as object;
  } catch {
    return '';
  }
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

