import { useState } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import { useDeferredText } from '../../hooks/useDeferredText';
import { TagEditModal } from './TagEditModal';

interface PlanHeaderProps {
  planId: string;
  slogan: string | null;
  genres: string[];
  moods: string[];
  targetAudience: string | null;
  onMetaChange: (patch: MetaPatch) => void;

  /** plan_note 가 선택된 상태면 하단에 문서 제목 바를 추가로 노출. */
  currentNote?: {
    id: string;
    title: string;
    onTitleChange: (title: string) => void;
    onBack: () => void;
  };
}

type MetaPatch = Partial<{
  slogan: string | null;
  genres: string | null;
  moods: string | null;
  target_audience: string | null;
}>;

type TagField = 'genres' | 'moods';

const TAG_LABELS: Record<TagField, string> = {
  genres: '장르',
  moods: '분위기',
};

/**
 * 기획 섹션 상단 헤더 — plan_note 선택 여부와 무관하게 항상 렌더된다.
 *
 * 레이아웃:
 *  ┌──────────────────────────────────────────────┐
 *  │ (선택 문서 있으면) ← [현재 문서 제목]          │
 *  │ 장르: [칩][칩][+]    분위기: [칩][칩][+]      │
 *  │ 슬로건 ________________________________      │
 *  │ 타겟   ________________________________      │
 *  └──────────────────────────────────────────────┘
 *
 * - 장르/분위기: 좌우 나란히, 읽기 전용 칩 + "+" 버튼 → TagEditModal
 * - 슬로건/타겟: borderless 인라인 텍스트 편집 (useDeferredText + onBlur 커밋)
 * - 현재 문서 제목: 인라인 편집 (onBlur/Enter 커밋)
 */
export function PlanHeader({
  planId,
  slogan,
  genres,
  moods,
  targetAudience,
  onMetaChange,
  currentNote,
}: PlanHeaderProps) {
  const sloganField = useDeferredText(planId, slogan ?? '', (v) =>
    onMetaChange({ slogan: v || null }),
  );
  const targetField = useDeferredText(planId, targetAudience ?? '', (v) =>
    onMetaChange({ target_audience: v || null }),
  );

  const [modal, setModal] = useState<TagField | null>(null);

  const handleTagsApply = (field: TagField) => (next: string[]) => {
    onMetaChange({
      [field]: next.length > 0 ? JSON.stringify(next) : null,
    } as MetaPatch);
  };

  const removeTag = (field: TagField, idx: number) => {
    const current = field === 'genres' ? genres : moods;
    const next = current.filter((_, i) => i !== idx);
    onMetaChange({
      [field]: next.length > 0 ? JSON.stringify(next) : null,
    } as MetaPatch);
  };

  return (
    <div className="shrink-0 border-b border-border bg-muted/50">
      {/* 1. 현재 선택 문서 제목 바 — 선택 시에만 최상단에 표시 */}
      {currentNote && (
        <CurrentNoteBar
          key={currentNote.id}
          title={currentNote.title}
          onTitleChange={currentNote.onTitleChange}
          onBack={currentNote.onBack}
        />
      )}

      {/*
        레이아웃:
        ┌─────────────────┬─────────────────┐
        │  장르 [칩][+]    │  분위기 [칩][+]  │
        ├─────────────────┴─────────────────┤
        │  슬로건 [____borderless__________] │
        │  타겟   [____borderless__________] │
        └───────────────────────────────────┘
      */}
      <div className="space-y-2.5 px-6 pb-3 pt-4">
        {/* R1: 장르 + 분위기 나란히 */}
        <div className="grid grid-cols-1 gap-x-6 gap-y-2.5 md:grid-cols-2">
          <TagRow
            field="genres"
            label={TAG_LABELS.genres}
            tags={genres}
            onAdd={() => setModal('genres')}
            onRemove={(idx) => removeTag('genres', idx)}
          />
          <TagRow
            field="moods"
            label={TAG_LABELS.moods}
            tags={moods}
            onAdd={() => setModal('moods')}
            onRemove={(idx) => removeTag('moods', idx)}
          />
        </div>

        {/* R2: 슬로건 */}
        <div className="flex items-center gap-2">
          <label className="w-14 shrink-0 text-xs font-medium text-muted-foreground">슬로건</label>
          <input
            type="text"
            value={sloganField.value}
            onChange={(e) => sloganField.onChange(e.target.value)}
            onBlur={sloganField.onBlur}
            placeholder="작품의 핵심을 한 줄로"
            className="w-full bg-transparent py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>

        {/* R3: 타겟 */}
        <div className="flex items-center gap-2">
          <label className="w-14 shrink-0 text-xs font-medium text-muted-foreground">타겟</label>
          <input
            type="text"
            value={targetField.value}
            onChange={(e) => targetField.onChange(e.target.value)}
            onBlur={targetField.onBlur}
            placeholder="20·30대 여성, 정통 판타지 팬 등"
            className="w-full bg-transparent py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* 태그 편집 모달 */}
      <TagEditModal
        open={modal === 'genres'}
        title="장르 편집"
        value={genres}
        onApply={handleTagsApply('genres')}
        onClose={() => setModal(null)}
        placeholder="판타지 입력 후 Enter"
      />
      <TagEditModal
        open={modal === 'moods'}
        title="분위기 편집"
        value={moods}
        onApply={handleTagsApply('moods')}
        onClose={() => setModal(null)}
        placeholder="다크 입력 후 Enter"
      />
    </div>
  );
}

interface TagRowProps {
  field: TagField;
  label: string;
  tags: string[];
  onAdd: () => void;
  onRemove: (idx: number) => void;
}

function TagRow({ field, label, tags, onAdd, onRemove }: TagRowProps) {
  return (
    <div className="flex items-center gap-2">
      <label className="w-14 shrink-0 text-xs font-medium text-muted-foreground">{label}</label>
      <div className="flex min-h-8 flex-1 flex-wrap items-center gap-1.5">
        {tags.map((tag, idx) => (
          <span
            key={`${field}-${tag}-${idx}`}
            className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
          >
            {tag}
            <button
              type="button"
              onClick={() => onRemove(idx)}
              aria-label={`${tag} 제거`}
              className="rounded text-primary/70 hover:bg-primary/20 hover:text-primary"
            >
              ×
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={onAdd}
          aria-label={`${label} 추가`}
          title={`${label} 추가`}
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-input bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
        >
          <Plus size={12} strokeWidth={2.5} />
          추가
        </button>
      </div>
    </div>
  );
}

interface CurrentNoteBarProps {
  title: string;
  onTitleChange: (title: string) => void;
  onBack: () => void;
}

function CurrentNoteBar({ title, onTitleChange, onBack }: CurrentNoteBarProps) {
  const [value, setValue] = useState(title);

  // 상위에서 title 바뀌면 동기화 (다른 창에서 sync 된 경우)
  // 단, 사용자가 편집 중이면 덮어쓰지 않음 — useEffect로 구현하면 복잡해지므로
  // key={id} 로 컴포넌트 재생성하여 초기값 보장 (PlanHeader 에서 key 전달).

  const commit = () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === title) {
      setValue(title);
      return;
    }
    onTitleChange(trimmed);
  };

  return (
    <div className="flex items-center gap-2 border-b border-border bg-background px-6 py-2">
      <button
        type="button"
        onClick={onBack}
        aria-label="메타로 돌아가기"
        title="메타 뷰로 돌아가기"
        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      >
        <ArrowLeft size={14} strokeWidth={2} />
      </button>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setValue(title);
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        placeholder="문서 제목"
        className="flex-1 bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground/50"
      />
    </div>
  );
}
