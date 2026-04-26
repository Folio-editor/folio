// ============================================================
// SidebarSortPicker — 사이드바 패널 검색창 아래 정렬 토글
// ============================================================
// 클릭마다 모드 순환 (manual → recent → alpha → manual ...)
// 작은 라벨 + 아이콘 — 좁은 사이드바 공간에 적합
// ============================================================

import { ArrowDownUp } from 'lucide-react';
import {
  useSortPreferenceStore,
  type SortMode,
  type SortPanelKey,
} from '../../../stores/sortPreferenceStore';

const LABELS: Record<SortMode, string> = {
  manual: '기본순',
  recent: '최근 편집순',
  alpha: '가나다 순',
};

const ORDER: SortMode[] = ['manual', 'recent', 'alpha'];

interface Props {
  panelKey: SortPanelKey;
}

export function SidebarSortPicker({ panelKey }: Props) {
  const mode = useSortPreferenceStore((s) => s.byPanel[panelKey] ?? 'manual');
  const setMode = useSortPreferenceStore((s) => s.set);

  const cycle = () => {
    const i = ORDER.indexOf(mode);
    const next = ORDER[(i + 1) % ORDER.length];
    setMode(panelKey, next);
  };

  return (
    <div className="flex shrink-0 items-center justify-end px-3 py-1">
      <button
        type="button"
        onClick={cycle}
        title={`정렬: ${LABELS[mode]} (클릭하여 변경)`}
        aria-label={`정렬 기준: ${LABELS[mode]}`}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <ArrowDownUp size={11} strokeWidth={1.75} />
        <span>{LABELS[mode]}</span>
      </button>
    </div>
  );
}
