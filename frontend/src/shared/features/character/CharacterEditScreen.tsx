import { useQuery } from '@powersync/react';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { useDeferredText } from '../../hooks/useDeferredText';
import { Input } from '../../components/ui/Input';
import { IconButton } from '../../components/ui/IconButton';
import { ContentEditor } from '../../components/ui/ContentEditor';
import { CharacterForm } from './CharacterForm';

interface CharacterEditScreenProps {
  id: string;
  onBack: () => void;
}

interface CharacterRow {
  id: string;
  name: string;
  gender: string;
  age: string;
  appearance: string;
  mbti: string | null;
  personality: string | null;
  content: string | null;
}

export function CharacterEditScreen({ id, onBack }: CharacterEditScreenProps) {
  const { data: rows = [] } = useQuery<CharacterRow>(
    `SELECT id, name, gender, age, appearance, mbti, personality, content
     FROM character WHERE id = ?`,
    [id],
  );
  const character = rows[0];

  if (!character) {
    return <div className="p-8 text-sm text-muted-foreground">캐릭터를 불러오는 중…</div>;
  }

  return <CharacterEditor key={id} character={character} onBack={onBack} />;
}

interface CharacterEditorProps {
  character: CharacterRow;
  onBack: () => void;
}

function CharacterEditor({ character, onBack }: CharacterEditorProps) {
  const { updateCharacter } = useLocalWrite();
  const { id } = character;

  const name = useDeferredText(id, character.name, (v) =>
    void updateCharacter(id, { name: v }),
  );
  const age = useDeferredText(id, character.age, (v) =>
    void updateCharacter(id, { age: v }),
  );
  const appearance = useDeferredText(id, character.appearance, (v) =>
    void updateCharacter(id, { appearance: v }),
  );
  const mbti = useDeferredText(id, character.mbti ?? '', (v) =>
    void updateCharacter(id, { mbti: v || null }),
  );
  const personality = useDeferredText(id, character.personality ?? '', (v) =>
    void updateCharacter(id, { personality: v || null }),
  );

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <IconButton onClick={onBack} title="목록으로">
          ←
        </IconButton>
        <Input
          value={name.value}
          onChange={(e) => name.onChange(e.target.value)}
          onBlur={name.onBlur}
          placeholder="이름"
          className="border-none px-0 text-base font-medium focus:ring-0"
        />
      </header>
      <CharacterForm
        gender={character.gender}
        onGenderChange={(v) => void updateCharacter(id, { gender: v })}
        age={age}
        appearance={appearance}
        mbti={mbti}
        personality={personality}
      />
      <ContentEditor
        itemId={id}
        initialContent={character.content}
        placeholder="배경, 인생 사건, 관계 등 자유 메모…"
        onUpdate={(content) => void updateCharacter(id, { content })}
      />
    </div>
  );
}
