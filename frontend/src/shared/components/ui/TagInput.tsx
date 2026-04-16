import { useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  /** 중복/공백 제외한 최종 태그 갯수 상한. 기본 없음. */
  maxTags?: number;
  /** 각 태그 문자열 길이 상한. 기본 30. */
  maxTagLength?: number;
  className?: string;
}

/**
 * 칩 형태로 태그를 관리하는 입력 컴포넌트.
 *
 * - Enter / Tab / Comma(`,`) 로 현재 입력을 태그로 커밋
 * - 빈 입력에서 Backspace → 마지막 태그 제거
 * - 칩 X 클릭으로 개별 제거
 * - 공백 trim, 빈 문자열·중복 자동 무시
 * - Blur 시에도 남은 텍스트를 커밋 (입력 후 커밋 누락 방지)
 */
export function TagInput({
  value,
  onChange,
  placeholder = '태그 입력 후 Enter',
  maxTags,
  maxTagLength = 30,
  className,
}: TagInputProps) {
  const [draft, setDraft] = useState('');

  const commitDraft = (raw: string) => {
    const trimmed = raw.trim().slice(0, maxTagLength);
    if (!trimmed) return;
    if (value.includes(trimmed)) return;
    if (maxTags !== undefined && value.length >= maxTags) return;
    onChange([...value, trimmed]);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // 한글 IME 조합 중에는 커밋하지 않음 — Enter 가 IME 확정용이어야 함
    if (e.nativeEvent.isComposing) return;

    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      if (draft.trim()) {
        e.preventDefault();
        commitDraft(draft);
        setDraft('');
      }
      return;
    }

    if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      e.preventDefault();
      onChange(value.slice(0, -1));
    }
  };

  const removeTag = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  const handleBlur = () => {
    if (draft.trim()) {
      commitDraft(draft);
      setDraft('');
    }
  };

  return (
    <div
      className={cn(
        'flex min-h-[34px] w-full flex-wrap items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm transition-colors focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500',
        className,
      )}
    >
      {value.map((tag, idx) => (
        <span
          key={`${tag}-${idx}`}
          className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(idx)}
            aria-label={`${tag} 제거`}
            className="rounded hover:bg-blue-200 hover:text-blue-900"
          >
            <X size={12} strokeWidth={2.25} />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={value.length === 0 ? placeholder : ''}
        className="min-w-[80px] flex-1 bg-transparent px-1 py-0.5 text-sm text-gray-800 placeholder-gray-400 outline-none"
      />
    </div>
  );
}
