import { useMemo, useState } from 'react';
import { useQuery } from '@powersync/react';
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
}

export function CharacterOverviewAll({ workId, onSelect }: CharacterOverviewAllProps) {
  const writerId = useWriterId();
  const { createCharacter } = useLocalWrite();
  const { data: items = [] } = useQuery<CharacterRow>(
    `SELECT id, name, gender, age FROM character
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

  const tagsByCharacter = useMemo(() => {
    const map = new Map<string, { world_note_id: string; name: string }[]>();
    for (const tag of allTags) {
      if (!map.has(tag.character_id)) map.set(tag.character_id, []);
      map.get(tag.character_id)!.push({ world_note_id: tag.world_note_id, name: tag.name });
    }
    return map;
  }, [allTags]);

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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredItems.map((item) => {
              const charTags = tagsByCharacter.get(item.id) ?? [];
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect('char:' + item.id)}
                  className="flex flex-col items-start rounded-lg border border-border bg-background p-4 text-left transition-colors hover:border-primary/40 hover:shadow-sm"
                >
                  <div className="mb-1 text-base font-semibold text-foreground">{item.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {item.gender}{item.age ? ` · ${item.age}` : ''}
                  </div>
                  {charTags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {charTags.map((t) => (
                        <span
                          key={t.world_note_id}
                          className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary"
                        >
                          {t.name}
                        </span>
                      ))}
                    </div>
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
