import { useMemo, useState } from 'react';
import { useQuery } from '@powersync/react';
import { IconGenderMale, IconGenderFemale, IconGenderBigender, IconQuestionMark } from '@tabler/icons-react';
import { useWriterId } from '../../hooks/useWriterId';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { Button } from '../../components/ui/Button';
import { MainPanelHeader } from '../../components/layout/MainPanelHeader';
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
}

const GENDER_ICON_MAP: Record<string, React.ComponentType<{ size: number; stroke: number; className?: string }>> = {
  '남': IconGenderMale,
  '여': IconGenderFemale,
  '기타': IconGenderBigender,
  '미설정': IconQuestionMark,
};

const GENDER_COLOR: Record<string, string> = {
  '남': 'text-blue-500',
  '여': 'text-pink-500',
  '기타': 'text-violet-500',
  '미설정': 'text-muted-foreground',
};

export function CharacterOverviewAll({ workId, onSelect }: CharacterOverviewAllProps) {
  const writerId = useWriterId();
  const { createCharacter } = useLocalWrite();
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
    `SELECT character_id, title FROM character_note
     WHERE character_id IN (SELECT id FROM character WHERE work_id = ? AND writer_id = ?)
     ORDER BY sort_order ASC`,
    [workId, writerId],
  );

  const tagsByCharacter = useMemo(() => {
    const map = new Map<string, { world_note_id: string; name: string }[]>();
    for (const tag of allTags) {
      if (!map.has(tag.character_id)) map.set(tag.character_id, []);
      map.get(tag.character_id)!.push({ world_note_id: tag.world_note_id, name: tag.name });
    }
    return map;
  }, [allTags]);

  const notesByCharacter = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const note of allNotes) {
      if (!map.has(note.character_id)) map.set(note.character_id, []);
      map.get(note.character_id)!.push(note.title);
    }
    return map;
  }, [allNotes]);

  const uniqueTags = useMemo(() => {
    const seen = new Map<string, string>();
    for (const tag of allTags) {
      if (!seen.has(tag.world_note_id)) seen.set(tag.world_note_id, tag.name);
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [allTags]);

  const [filterTagIds, setFilterTagIds] = useState<Set<string>>(new Set());

  const toggleFilter = (tagId: string) => {
    setFilterTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  };

  const filteredItems = filterTagIds.size === 0
    ? items
    : items.filter((item) => {
        const charTags = tagsByCharacter.get(item.id);
        if (!charTags) return false;
        return charTags.some((t) => filterTagIds.has(t.world_note_id));
      });

  const handleNew = async () => {
    const id = await createCharacter(workId, '새 인물', '미설정', '', items.length);
    onSelect('char:' + id);
  };

  return (
    <div className="flex h-full flex-col">
      <MainPanelHeader
        title={<h2 className="text-lg font-semibold">등장인물</h2>}
        subtitle="캐릭터 프로필과 설정을 관리합니다"
        trailing={<Button onClick={() => void handleNew()}>+ 새 인물</Button>}
      />
      <div className="flex-1 overflow-y-auto p-6">
        {uniqueTags.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {uniqueTags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleFilter(tag.id)}
                className={cn(
                  'rounded-md px-2 py-0.5 text-xs font-medium transition-colors',
                  filterTagIds.has(tag.id)
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-accent',
                )}
              >
                {tag.name}
              </button>
            ))}
            {filterTagIds.size > 0 && (
              <button
                type="button"
                onClick={() => setFilterTagIds(new Set())}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                초기화
              </button>
            )}
          </div>
        )}
        {filteredItems.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {items.length === 0 ? '아직 등장인물이 없습니다.' : '필터에 맞는 등장인물이 없습니다.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {filteredItems.map((item) => {
              const charTags = tagsByCharacter.get(item.id) ?? [];
              const charNotes = notesByCharacter.get(item.id) ?? [];
              const GenderIcon = GENDER_ICON_MAP[item.gender] ?? IconQuestionMark;
              const genderColor = GENDER_COLOR[item.gender] ?? GENDER_COLOR['미설정'];
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect('char:' + item.id)}
                  className="flex gap-4 rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-primary/40 hover:shadow-sm"
                >
                  {/* 프로필 이미지 — 디테일 화면과 동일 비율 */}
                  <div className="flex h-28 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                    {item.profile_image_url ? (
                      <img src={item.profile_image_url} alt={item.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-2xl font-bold text-muted-foreground/30">{item.name.charAt(0) || '?'}</span>
                    )}
                  </div>

                  {/* 정보 영역 */}
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5 py-0.5">
                    {/* 이름 / 나이 + 성별 아이콘 */}
                    <div className="flex items-center gap-1.5">
                      <GenderIcon size={16} stroke={1.75} className={genderColor} />
                      <span className="text-sm font-semibold text-foreground">{item.name}</span>
                      {item.age && (
                        <>
                          <span className="text-xs text-muted-foreground/40 select-none">/</span>
                          <span className="text-xs text-muted-foreground">{item.age}</span>
                        </>
                      )}
                    </div>

                    {/* 태그 */}
                    {charTags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {charTags.map((t) => (
                          <span
                            key={t.world_note_id}
                            className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                          >
                            {t.name}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* 하위 문서 목록 */}
                    {charNotes.length > 0 && (
                      <div className="mt-auto flex flex-wrap gap-x-2 gap-y-0.5">
                        {charNotes.map((title, i) => (
                          <span key={i} className="text-[10px] text-muted-foreground">
                            {title}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
