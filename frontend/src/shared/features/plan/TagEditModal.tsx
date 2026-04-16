import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { TagInput } from '../../components/ui/TagInput';
import { Button } from '../../components/ui/Button';

interface TagEditModalProps {
  open: boolean;
  title: string;
  value: string[];
  onApply: (next: string[]) => void;
  onClose: () => void;
  placeholder?: string;
}

/**
 * 태그(장르·분위기) 편집 모달.
 *
 * - 내부에 TagInput을 그대로 임베드 — Enter/Tab/Comma 커밋, 칩 X 제거 동일 동작
 * - "적용" 버튼으로 결과 확정. ESC 또는 배경 클릭으로 취소.
 * - 열릴 때 현재 value 로 초기화된 로컬 draft 상태 → 사용자가 모달 내에서 자유롭게 편집 후 일괄 커밋.
 */
export function TagEditModal({
  open,
  title,
  value,
  onApply,
  onClose,
  placeholder,
}: TagEditModalProps) {
  const [draft, setDraft] = useState<string[]>(value);

  // 모달이 열릴 때마다 외부 value 로 초기화
  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  // ESC 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleApply = () => {
    onApply(draft);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <p className="mb-2 text-xs text-gray-500">
          Enter 또는 쉼표로 태그를 추가, 칩의 × 로 개별 제거
        </p>

        <TagInput
          value={draft}
          onChange={setDraft}
          placeholder={placeholder ?? '태그 입력 후 Enter'}
        />

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" onClick={handleApply}>
            적용
          </Button>
        </div>
      </div>
    </div>
  );
}
