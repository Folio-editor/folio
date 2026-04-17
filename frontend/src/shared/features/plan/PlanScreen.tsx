import { useEffect, useState } from 'react';
import { useQuery } from '@powersync/react';
import { useWriterId } from '../../hooks/useWriterId';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { useDeferredText } from '../../hooks/useDeferredText';
import { Input } from '../../components/ui/Input';
import { Textarea } from '../../components/ui/Textarea';
import { ContentEditor } from '../../components/ui/ContentEditor';
import { SectionHeader } from '../../components/layout/SectionHeader';

interface PlanScreenProps {
  workId: string;
}

interface PlanRow {
  id: string;
  slogan: string | null;
  genres: string | null;
  moods: string | null;
  target_audience: string | null;
  content: string | null;
}

/**
 * Plan은 work당 1개 — 화면 진입 시 ensurePlan으로 자동 생성/조회한다.
 * 텍스트 입력은 onBlur 커밋(useDeferredText)으로 keystroke마다의 SQLite write를 피한다.
 */
export function PlanScreen({ workId }: PlanScreenProps) {
  const writerId = useWriterId();
  const { ensurePlan, updatePlan } = useLocalWrite();
  const [planId, setPlanId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void ensurePlan(workId).then((id) => {
      if (mounted) setPlanId(id);
    });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workId, writerId]);

  const { data: rows = [] } = useQuery<PlanRow>(
    `SELECT id, slogan, genres, moods, target_audience, content FROM plan WHERE work_id = ? LIMIT 1`,
    [workId],
  );
  const plan = rows[0];

  if (!plan || !planId) {
    return <div className="p-8 text-sm text-gray-500">기획을 불러오는 중…</div>;
  }

  return <PlanForm plan={plan} planId={planId} updatePlan={updatePlan} />;
}

interface PlanFormProps {
  plan: PlanRow;
  planId: string;
  updatePlan: (id: string, patch: Record<string, string | null>) => Promise<void>;
}

function PlanForm({ plan, planId, updatePlan }: PlanFormProps) {
  const slogan = useDeferredText(plan.id, plan.slogan ?? '', (v) =>
    void updatePlan(plan.id, { slogan: v || null }),
  );
  const genresText = useDeferredText(plan.id, parseTags(plan.genres).join(', '), (v) =>
    void updatePlan(plan.id, { genres: serializeTags(v) }),
  );
  const moodsText = useDeferredText(plan.id, parseTags(plan.moods).join(', '), (v) =>
    void updatePlan(plan.id, { moods: serializeTags(v) }),
  );
  const target = useDeferredText(plan.id, plan.target_audience ?? '', (v) =>
    void updatePlan(plan.id, { target_audience: v || null }),
  );

  return (
    <div className="flex h-full flex-col">
      <SectionHeader title="기획" description="작품의 방향성을 한 곳에 정리합니다" />

      <div className="grid grid-cols-2 gap-4 border-b px-8 py-5">
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-600">슬로건</label>
          <Input
            value={slogan.value}
            onChange={(e) => slogan.onChange(e.target.value)}
            onBlur={slogan.onBlur}
            placeholder="작품의 핵심을 한 줄로"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">장르 (쉼표 구분)</label>
          <Input
            value={genresText.value}
            onChange={(e) => genresText.onChange(e.target.value)}
            onBlur={genresText.onBlur}
            placeholder="판타지, 로맨스"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">분위기 (쉼표 구분)</label>
          <Input
            value={moodsText.value}
            onChange={(e) => moodsText.onChange(e.target.value)}
            onBlur={moodsText.onBlur}
            placeholder="진지, 다크"
          />
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-600">타겟 독자</label>
          <Textarea
            rows={2}
            value={target.value}
            onChange={(e) => target.onChange(e.target.value)}
            onBlur={target.onBlur}
            placeholder="20·30대 여성, 정통 판타지 팬 등"
          />
        </div>
      </div>

      <ContentEditor
        itemId={planId}
        initialContent={plan.content}
        placeholder="시놉시스, 레퍼런스, 메모를 자유롭게 작성하세요…"
        onUpdate={(content) => void updatePlan(plan.id, { content })}
      />
    </div>
  );
}

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((v) => typeof v === 'string');
  } catch {
    /* 빈 입력 또는 손상 — 빈 배열 반환 */
  }
  return [];
}

function serializeTags(input: string): string | null {
  const tags = input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return tags.length > 0 ? JSON.stringify(tags) : null;
}
