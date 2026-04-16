import { useQuery } from '@powersync/react';
import { useWriterId } from '../../hooks/useWriterId';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { Button } from '../../components/ui/Button';
import { SectionHeader } from '../../components/layout/SectionHeader';

interface CharacterListScreenProps {
  workId: string;
  onSelect: (id: string) => void;
}

interface CharacterRow {
  id: string;
  name: string;
  gender: string;
  age: string;
  appearance: string;
}

export function CharacterListScreen({ workId, onSelect }: CharacterListScreenProps) {
  const writerId = useWriterId();
  const { createCharacter } = useLocalWrite();
  const { data: items = [] } = useQuery<CharacterRow>(
    `SELECT id, name, gender, age, appearance FROM character
     WHERE work_id = ? AND writer_id = ?
     ORDER BY sort_order ASC, created_at ASC`,
    [workId, writerId],
  );

  const handleNew = async () => {
    const id = await createCharacter(workId, '새 인물', '미설정', '', '', items.length);
    onSelect(id);
  };

  return (
    <div className="flex h-full flex-col">
      <SectionHeader
        title="등장인물"
        description="캐릭터의 프로필과 성격을 관리합니다"
        actions={<Button onClick={() => void handleNew()}>+ 새 인물</Button>}
      />
      <div className="flex-1 overflow-y-auto p-6">
        {items.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400">아직 등장인물이 없습니다.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className="flex flex-col items-start rounded-lg border border-gray-200 bg-white p-4 text-left transition-colors hover:border-blue-400 hover:shadow-sm"
              >
                <div className="mb-1 text-base font-semibold text-gray-900">{item.name}</div>
                <div className="text-xs text-gray-500">
                  {item.gender}{item.age ? ` · ${item.age}` : ''}
                </div>
                {item.appearance && (
                  <p className="mt-2 line-clamp-2 text-xs text-gray-600">{item.appearance}</p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
