import { useEffect } from 'react';
import { BookOpen, FileText, Globe2, Sparkles, X } from 'lucide-react';
import { PLAN_TEMPLATES, type PlanTemplate } from './planTemplates';

interface PlanTemplatePickerModalProps {
  open: boolean;
  onSelect: (template: PlanTemplate) => void;
  onClose: () => void;
}

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex items-start justify-between border-b border-border px-6 py-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Folio Templates
            </p>
            <h3 className="mt-1 text-xl font-semibold text-foreground">기획 템플릿 선택</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              작품의 성격에 맞는 시작점을 고르면, 문서 안에 기획서 구조가 자동으로 채워집니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <X size={17} strokeWidth={2} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
          {PLAN_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => onSelect(template)}
              className="group relative flex min-h-40 flex-col items-start overflow-hidden rounded-lg border border-border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-ring hover:shadow-md focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 h-1 bg-primary/70 opacity-0 transition-opacity group-hover:opacity-100"
              />
              <span className="mb-4 grid size-10 place-items-center rounded-md border border-border bg-muted text-foreground transition-colors group-hover:border-primary/30 group-hover:bg-primary/10 group-hover:text-primary">
                <TemplateIcon iconKey={template.iconKey} />
              </span>
              <span className="text-sm font-semibold text-foreground">{template.label}</span>
              <span className="mt-2 text-xs leading-5 text-muted-foreground">
                {template.description}
              </span>
              <span className="mt-auto pt-4 text-[11px] font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                이 템플릿으로 시작
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TemplateIcon({ iconKey }: { iconKey: PlanTemplate['iconKey'] }) {
  const props = { size: 19, strokeWidth: 1.9 } as const;
  switch (iconKey) {
    case 'file':
      return <FileText {...props} />;
    case 'sparkles':
      return <Sparkles {...props} />;
    case 'bookOpen':
      return <BookOpen {...props} />;
    case 'globe':
      return <Globe2 {...props} />;
  }
}
