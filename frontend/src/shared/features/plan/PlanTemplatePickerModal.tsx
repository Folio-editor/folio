import { useEffect } from 'react';
import { X } from 'lucide-react';
import { PLAN_TEMPLATES, type PlanTemplate } from './planTemplates';

interface PlanTemplatePickerModalProps {
  open: boolean;
  /** 사용자가 템플릿 카드 선택 시 호출. 부모는 선택한 템플릿으로 후속 흐름(제목 입력 등)을 진행 */
  onSelect: (template: PlanTemplate) => void;
  /** ESC, 배경 클릭, 우상단 ✕ 모두 동일 */
  onClose: () => void;
}

/**
 * 기획 문서 신규 생성 흐름 1단계: 템플릿 선택 모달.
 * 현재는 "빈 서식" 한 가지만 노출되지만, planTemplates 배열에 항목 추가만으로 자동 확장.
 * 카드 그리드는 항목 수에 따라 1~3 컬럼 자동 (sm: 2, md: 3).
 */
export function PlanTemplatePickerModal({
  open,
  onSelect,
  onClose,
}: PlanTemplatePickerModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="기획 문서 템플릿 선택"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl rounded-lg bg-background p-5 shadow-lg">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-foreground">템플릿 선택</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <p className="mb-4 text-xs text-muted-foreground">
          새 기획 문서의 시작 형태를 선택하세요. 선택 후 제목을 입력하면 문서가 생성됩니다.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          {PLAN_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => onSelect(template)}
              className="flex flex-col items-start gap-2 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-ring hover:bg-primary/5 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <span aria-hidden className="text-2xl leading-none">
                {template.icon}
              </span>
              <span className="text-sm font-medium text-foreground">{template.label}</span>
              <span className="text-xs text-muted-foreground">{template.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
