import { useQuery } from '@powersync/react';
import { useWriterId } from '../../hooks/useWriterId';
import { SECTION_ICONS, SECTION_LABELS, WorkspaceSection } from '../../types/workspace';

interface WorkspaceHomeScreenProps {
  workId: string;
  onSectionSelect: (section: WorkspaceSection) => void;
}

interface WorkRow {
  title: string;
  author_name: string | null;
  description: string | null;
  status: string;
}

const SECTIONS: WorkspaceSection[] = [
  'plan',
  'world-note',
  'character',
  'plot',
  'episode',
  'foreshadow',
  'idea-archive',
];

const SECTION_DESCRIPTIONS: Record<WorkspaceSection, string> = {
  'plan': '작품의 방향성·슬로건·장르·타겟 정의',
  'world-note': '시대·공간·세력·규칙 등 설정 자료',
  'character': '캐릭터 프로필과 성격',
  'plot': '줄거리 구조와 회차 설계',
  'episode': '실제 본문 집필',
  'foreshadow': '복선 설정과 회수 추적',
  'idea-archive': '영감과 좋은 문장 모음',
};

/**
 * 작품을 선택한 직후 보여주는 허브 화면.
 * 7개 영역 카드 → 클릭 시 해당 영역으로 이동.
 */
export function WorkspaceHomeScreen({ workId, onSectionSelect }: WorkspaceHomeScreenProps) {
  const writerId = useWriterId();
  const { data: works = [] } = useQuery<WorkRow>(
    `SELECT title, author_name, description, status FROM work WHERE id = ? AND writer_id = ?`,
    [workId, writerId],
  );
  const work = works[0];

  if (!work) {
    return <div className="p-8 text-sm text-gray-500">작품을 불러오는 중…</div>;
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto px-10 py-8">
      <div className="mb-8 border-b pb-6">
        <h1 className="text-2xl font-bold text-gray-900">{work.title}</h1>
        {work.author_name && (
          <p className="mt-1 text-sm text-gray-500">작가: {work.author_name}</p>
        )}
        {work.description && (
          <p className="mt-3 text-sm text-gray-600">{work.description}</p>
        )}
        <div className="mt-3">
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
            {work.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {SECTIONS.map((section) => (
          <button
            key={section}
            type="button"
            onClick={() => onSectionSelect(section)}
            className="flex flex-col items-start rounded-lg border border-gray-200 bg-white p-4 text-left transition-colors hover:border-blue-400 hover:bg-blue-50"
          >
            <span className="text-2xl">{SECTION_ICONS[section]}</span>
            <span className="mt-2 text-sm font-medium text-gray-900">
              {SECTION_LABELS[section]}
            </span>
            <span className="mt-1 text-xs text-gray-500">
              {SECTION_DESCRIPTIONS[section]}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
