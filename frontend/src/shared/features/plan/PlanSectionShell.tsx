import { useEffect, useState } from 'react';
import { useQuery } from '@powersync/react';
import { useWriterId } from '../../hooks/useWriterId';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { ContentEditor } from '../../components/ui/ContentEditor';
import { PlanHeader } from './PlanHeader';

interface PlanSectionShellProps {
  workId: string;
  selectedItemId: string | null;
  onItemBack: () => void;
}

interface PlanMetaRow {
  id: string;
  slogan: string | null;
  genres: string | null;
  moods: string | null;
  target_audience: string | null;
}

interface PlanNoteRow {
  id: string;
  title: string;
  content: string | null;
}

/**
 * 기획 섹션 전체를 감싸는 셸.
 *
 * - 최상단: PlanHeader (메타 상시 노출 + 선택 문서 제목 바)
 * - 메인: plan_note 가 선택되어 있으면 그 문서의 `content` 만 편집, 없으면 안내 문구
 *
 * `ensurePlan` 으로 메타 row 를 자동 생성하며, 메타는 useQuery 로 라이브 구독.
 */
export function PlanSectionShell({
  workId,
  selectedItemId,
  onItemBack,
}: PlanSectionShellProps) {
  const writerId = useWriterId();
  const { ensurePlan, updatePlan, updatePlanNoteTitle, updatePlanNoteContent } =
    useLocalWrite();
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

  const { data: metaRows = [] } = useQuery<PlanMetaRow>(
    `SELECT id, slogan, genres, moods, target_audience
     FROM plan WHERE work_id = ? LIMIT 1`,
    [workId],
  );
  const meta = metaRows[0];

  const { data: noteRows = [] } = useQuery<PlanNoteRow>(
    selectedItemId
      ? `SELECT id, title, content FROM plan_note WHERE id = ? LIMIT 1`
      : `SELECT '' AS id, '' AS title, NULL AS content WHERE 0`,
    selectedItemId ? [selectedItemId] : [],
  );
  const note = selectedItemId ? (noteRows[0] ?? null) : null;

  if (!meta || !planId) {
    return <div className="p-8 text-sm text-gray-500">기획을 불러오는 중…</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PlanHeader
        planId={planId}
        slogan={meta.slogan}
        genres={parseTags(meta.genres)}
        moods={parseTags(meta.moods)}
        targetAudience={meta.target_audience}
        onMetaChange={(patch) => void updatePlan(meta.id, patch)}
        currentNote={
          note
            ? {
                id: note.id,
                title: note.title,
                onTitleChange: (title) => void updatePlanNoteTitle(note.id, title),
                onBack: onItemBack,
              }
            : undefined
        }
      />

      {/* 메인: content 전용 */}
      <div className="flex min-h-0 flex-1 flex-col">
        {selectedItemId && note ? (
          <ContentEditor
            key={note.id}
            itemId={note.id}
            initialContent={note.content}
            placeholder="시놉시스, 레퍼런스, 메모를 자유롭게 작성하세요…"
            onUpdate={(content) => void updatePlanNoteContent(note.id, content)}
          />
        ) : selectedItemId && !note ? (
          <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
            문서를 불러오는 중…
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center px-8 text-center text-sm text-gray-400">
            좌측 사이드바에서 기획 문서를 선택하거나 "+ 새 문서" 로 추가하세요.
          </div>
        )}
      </div>
    </div>
  );
}

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((v) => typeof v === 'string');
  } catch {
    /* 손상 데이터 — 빈 배열 */
  }
  return [];
}
