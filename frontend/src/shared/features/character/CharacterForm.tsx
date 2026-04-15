import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Textarea } from '../../components/ui/Textarea';

interface DeferredField {
  value: string;
  onChange: (next: string) => void;
  onBlur: () => void;
}

interface CharacterFormProps {
  gender: string;
  onGenderChange: (next: string) => void;
  age: DeferredField;
  appearance: DeferredField;
  mbti: DeferredField;
  personality: DeferredField;
}

const GENDER_OPTIONS = [
  { value: '미설정', label: '미설정' },
  { value: '남', label: '남' },
  { value: '여', label: '여' },
  { value: '기타', label: '기타' },
];

const Field = ({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) => (
  <div>
    <label className="mb-1 block text-xs font-medium text-gray-600">
      {label}
      {required && <span className="ml-1 text-red-500">*</span>}
    </label>
    {children}
  </div>
);

/**
 * 상위에서 useDeferredText로 감싼 필드를 받아 dumb하게 렌더한다.
 * gender(Select)만 즉시 commit, 나머지는 onBlur 커밋.
 */
export function CharacterForm({
  gender,
  onGenderChange,
  age,
  appearance,
  mbti,
  personality,
}: CharacterFormProps) {
  return (
    <div className="grid grid-cols-2 gap-4 border-b px-8 py-5">
      <Field label="성별" required>
        <Select
          options={GENDER_OPTIONS}
          value={gender}
          onChange={(e) => onGenderChange(e.target.value)}
        />
      </Field>
      <Field label="나이" required>
        <Input
          value={age.value}
          onChange={(e) => age.onChange(e.target.value)}
          onBlur={age.onBlur}
          placeholder="예: 25세, 불명, 수백 년"
        />
      </Field>
      <div className="col-span-2">
        <Field label="외형" required>
          <Textarea
            rows={2}
            value={appearance.value}
            onChange={(e) => appearance.onChange(e.target.value)}
            onBlur={appearance.onBlur}
            placeholder="흑발 적안, 왼팔에 흉터 등"
          />
        </Field>
      </div>
      <Field label="MBTI">
        <Input
          value={mbti.value}
          onChange={(e) => mbti.onChange(e.target.value)}
          onBlur={mbti.onBlur}
          placeholder="예: INTJ"
        />
      </Field>
      <Field label="성격 요약">
        <Input
          value={personality.value}
          onChange={(e) => personality.onChange(e.target.value)}
          onBlur={personality.onBlur}
          placeholder="간단한 성격 키워드"
        />
      </Field>
    </div>
  );
}
