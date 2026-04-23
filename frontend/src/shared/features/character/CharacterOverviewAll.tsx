import { useMemo, type ReactElement } from 'react';
import { useQuery } from '@powersync/react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { MainPanelHeader } from '../../components/layout/MainPanelHeader';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { useWriterId } from '../../hooks/useWriterId';
import { cn } from '../../lib/cn';

interface CharacterOverviewAllProps {
  workId: string;
  onSelect: (prefixedId: string) => void;
}

interface CharacterRow {
  id: string;
  name: string;
  gender: string;
  age: string;
  profile_image_url: string | null;
}

interface NoteRow {
  character_id: string;
  title: string;
  kind: string;
  content: string | null;
}

interface CharacterNoteSummary {
  intro: string;
  titles: string[];
}

function MaleMark({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn('inline-flex items-center justify-center font-semibold leading-none', className)}
      style={{ fontSize: size }}
      aria-hidden="true"
    >
      ♂
    </span>
  );
}

function FemaleMark({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn('inline-flex items-center justify-center font-semibold leading-none', className)}
      style={{ fontSize: size }}
      aria-hidden="true"
    >
      ♀
    </span>
  );
}

function OtherMark({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn('inline-flex items-center justify-center font-semibold leading-none', className)}
      style={{ fontSize: size }}
      aria-hidden="true"
    >
      ⚥
    </span>
  );
}

const GENDER_LABEL_MAP: Record<string, string> = {
  male: '남',
  female: '여',
  other: '기타',
  unknown: '성별 미설정',
  남: '남',
  여: '여',
  기타: '기타',
  미설정: '성별 미설정',
};

const GENDER_TEXT_COLOR: Record<string, string> = {
  male: 'text-[#5B7CFF]',
  female: 'text-[#FF6B9A]',
  other: 'text-[#8B6DFF]',
  unknown: 'text-muted-foreground',
  남: 'text-[#5B7CFF]',
  여: 'text-[#FF6B9A]',
  기타: 'text-[#8B6DFF]',
  미설정: 'text-muted-foreground',
};

const GENDER_MARK_MAP: Record<string, ({ size, className }: { size?: number; className?: string }) => ReactElement> = {
  male: MaleMark,
  female: FemaleMark,
  other: OtherMark,
  남: MaleMark,
  여: FemaleMark,
  기타: OtherMark,
};

function normalizeGenderLabel(gender: string) {
  return GENDER_LABEL_MAP[gender] ?? '성별 미설정';
}

function CharacterAvatar({ name, src }: { name: string; src: string | null }) {
  if (src) {
    return <img src={src} alt={name} className="h-full w-full object-cover" />;
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-muted">
      <span className="text-4xl font-semibold tracking-tight text-muted-foreground/30">
        {name.charAt(0) || '?'}
      </span>
    </div>
  );
}

function extractPlainText(raw: string | null): string {
  if (!raw) return '';

  try {
    const parsed = JSON.parse(raw) as {
      text?: string;
      content?: unknown[];
    };
    return flattenTiptapText(parsed).trim();
  } catch {
    return raw.trim();
  }
}

function flattenTiptapText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';

  const typedNode = node as {
    text?: string;
    content?: unknown[];
  };
  const text = typeof typedNode.text === 'string' ? typedNode.text : '';
  const children = Array.isArray(typedNode.content)
    ? typedNode.content.map(flattenTiptapText).join(' ')
    : '';

  return [text, children].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

export function CharacterOverviewAll({ workId, onSelect }: CharacterOverviewAllProps) {
  const writerId = useWriterId();
  const { createCharacter, reorderItems } = useLocalWrite();
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const { data: items = [] } = useQuery<CharacterRow>(
    `SELECT id, name, gender, age, profile_image_url FROM character
     WHERE work_id = ? AND writer_id = ?
     ORDER BY sort_order ASC, created_at ASC`,
    [workId, writerId],
  );

  const { data: allTags = [] } = useQuery<{ character_id: string; world_note_id: string; name: string }>(
    `SELECT ct.character_id, ct.world_note_id, wn.name
     FROM character_tag ct
     JOIN world_note wn ON ct.world_note_id = wn.id
     WHERE ct.character_id IN (SELECT id FROM character WHERE work_id = ? AND writer_id = ?)
     ORDER BY wn.name ASC`,
    [workId, writerId],
  );

  const { data: allNotes = [] } = useQuery<NoteRow>(
    `SELECT character_id, title, kind, content FROM character_note
     WHERE character_id IN (SELECT id FROM character WHERE work_id = ? AND writer_id = ?)
     ORDER BY sort_order ASC`,
    [workId, writerId],
  );

  const tagsByCharacter = useMemo(() => {
    const map = new Map<string, { world_note_id: string; name: string }[]>();
    for (const tag of allTags) {
      if (!map.has(tag.character_id)) map.set(tag.character_id, []);
      map.get(tag.character_id)!.push({
        world_note_id: tag.world_note_id,
        name: tag.name,
      });
    }
    return map;
  }, [allTags]);

  const notesByCharacter = useMemo(() => {
    const map = new Map<string, CharacterNoteSummary>();
    for (const note of allNotes) {
      if (!map.has(note.character_id)) {
        map.set(note.character_id, { intro: '', titles: [] });
      }
      const entry = map.get(note.character_id)!;
      if (note.kind === 'intro') {
        entry.intro = extractPlainText(note.content);
      } else {
        entry.titles.push(note.title);
      }
    }
    return map;
  }, [allNotes]);

  const filteredItems = items;

  const handleNew = async () => {
    const id = await createCharacter(workId, '새 인물', '미설정', '', items.length);
    onSelect(`char:${id}`);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = filteredItems.findIndex((item) => item.id === active.id);
    const newIndex = filteredItems.findIndex((item) => item.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(filteredItems, oldIndex, newIndex);
    void reorderItems(
      'character',
      reordered.map((item, index) => ({
        id: item.id,
        sortOrder: index * 1000,
      })),
    );
  };

  return (
    <div className="flex h-full flex-col">
      <MainPanelHeader
        title={<h2 className="text-lg font-semibold">등장인물</h2>}
        subtitle="인물의 분위기와 설정을 한눈에 볼 수 있게 정리해보세요"
        trailing={<Button onClick={() => void handleNew()}>+ 새 인물</Button>}
      />

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={filteredItems.map((item) => item.id)}
            strategy={rectSortingStrategy}
          >
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              <button
                type="button"
                onClick={() => void handleNew()}
                className="group relative min-h-[232px] overflow-hidden rounded-[12px] border border-dashed border-border bg-background p-6 text-left transition-all hover:-translate-y-1 hover:border-border hover:bg-muted/40 hover:shadow-sm"
              >
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-border bg-muted text-foreground">
                    <Plus size={30} strokeWidth={1.8} />
                  </div>
                  <div className="space-y-2">
                    <p className="text-[1.65rem] font-semibold text-foreground">새 인물 추가</p>
                    <p className="text-[15px] leading-7 text-muted-foreground">
                      주인공, 조력자, 라이벌까지
                      <br />
                      작품의 얼굴이 될 인물을 만들어보세요.
                    </p>
                  </div>
                </div>
              </button>

              {filteredItems.map((item) => {
                const charTags = tagsByCharacter.get(item.id) ?? [];
                const charNotes = notesByCharacter.get(item.id) ?? { intro: '', titles: [] };
                const genderLabel = normalizeGenderLabel(item.gender);
                const GenderMark = GENDER_MARK_MAP[item.gender];
                const summary = charNotes.intro || '한 줄 소개를 아직 작성하지 않았어요.';

                return (
                  <SortableCharacterCard
                    key={item.id}
                    characterId={item.id}
                    onClick={() => onSelect(`char:${item.id}`)}
                  >
                    <div className="group relative min-h-[232px] overflow-hidden rounded-[14px] border border-border/80 bg-background px-5 py-5 text-left transition-all duration-200 hover:-translate-y-1 hover:border-border hover:shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
                      <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(148,163,184,0.08),transparent_28%)] opacity-60" />

                      <div className="relative flex h-full flex-col gap-4">
                        <div className="flex items-center gap-4">
                          <div className="h-28 w-24 shrink-0 overflow-hidden rounded-[10px] border border-border/80 bg-muted shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
                            <CharacterAvatar name={item.name} src={item.profile_image_url} />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="space-y-1.5">
                              <h3 className="line-clamp-2 text-[1.45rem] font-medium leading-[1.1] tracking-[-0.03em] text-foreground">
                                {item.name || '이름 없는 인물'}
                              </h3>
                              <p className="text-[15px] text-muted-foreground">
                                <span
                                  className={cn(
                                    'inline-flex items-center gap-1',
                                    GENDER_TEXT_COLOR[item.gender] ?? GENDER_TEXT_COLOR.unknown,
                                  )}
                                >
                                  {GenderMark ? <GenderMark size={15} /> : null}
                                  {genderLabel}
                                </span>
                                <span className="mx-1 text-muted-foreground/60">·</span>
                                <span>{item.age || '나이 미설정'}</span>
                              </p>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                              {charTags.length > 0 ? (
                                charTags.slice(0, 3).map((tag) => (
                                  <span
                                    key={tag.world_note_id}
                                    className="rounded-[6px] border border-border/80 bg-muted px-3 py-1.5 text-[11px] font-medium text-foreground shadow-sm"
                                  >
                                    {tag.name}
                                  </span>
                                ))
                              ) : (
                                <span className="rounded-[6px] border border-border/80 bg-muted px-3 py-1.5 text-[11px] text-muted-foreground shadow-sm">
                                  태그 없음
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="rounded-[8px] border border-border/80 bg-muted/40 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]">
                          <p className="line-clamp-3 text-[15px] leading-7 text-foreground/80">
                            {summary}
                          </p>
                        </div>
                      </div>
                    </div>
                  </SortableCharacterCard>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>

        {filteredItems.length === 0 && (
          <div className="flex min-h-[280px] items-center justify-center">
            <p className="text-sm text-muted-foreground">아직 등장인물이 없습니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SortableCharacterCard({
  characterId,
  onClick,
  children,
}: {
  characterId: string;
  onClick: () => void;
  children: ReactElement;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: characterId });

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        'block cursor-grab text-left active:cursor-grabbing',
        isDragging && 'z-10 cursor-grabbing opacity-70',
      )}
      {...attributes}
      {...listeners}
    >
      {children}
    </button>
  );
}
