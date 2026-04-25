// ============================================================
// EmptyMainState — mainDoc 이 null 일 때 메인 패널에 표시
// ============================================================
// Stage Manager 단순화 모델: activity 변경이 메인을 건드리지 않으므로
// "선택된 작품은 있지만 메인 슬롯이 비어있는" 상태가 자주 발생.
// 사이드바 클릭으로 메인을 채우라는 가이드 + 인터랙션 그래머 안내.
// ============================================================

import { Activity } from '../../types/workspace';

interface EmptyMainStateProps {
  /** 현재 사이드바가 보여주는 섹션 (가이드 텍스트 표시용) */
  activity: Activity;
}

const ACTIVITY_GUIDE: Partial<Record<Activity, { label: string; hint: string }>> = {
  plan:           { label: '기획',     hint: '좌측에서 기획 문서를 선택하거나 새로 만드세요.' },
  'world-note':   { label: '세계관',   hint: '좌측에서 세계관 문서를 선택하세요.' },
  character:      { label: '등장인물', hint: '좌측에서 인물을 선택하세요.' },
  episode:        { label: '원고',     hint: '좌측에서 원고를 선택하세요.' },
  foreshadow:     { label: '복선',     hint: '좌측에서 복선을 선택하세요.' },
  'idea-archive': { label: '아이디어', hint: '좌측에서 아이디어를 선택하세요.' },
};

export function EmptyMainState({ activity }: EmptyMainStateProps) {
  const guide = ACTIVITY_GUIDE[activity];

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-8 text-center">
      <div className="max-w-md">
        <h2 className="text-base font-medium text-foreground">
          {guide ? `${guide.label} 작업 준비됨` : '문서를 선택하세요'}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {guide?.hint ?? '좌측 사이드바에서 문서를 선택하거나 새로 만드세요.'}
        </p>
      </div>

      <div className="rounded-lg border border-border/60 bg-muted/30 px-5 py-4 text-left text-xs text-muted-foreground">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
          인터랙션
        </div>
        <ul className="space-y-1.5">
          <li>
            <span className="rounded bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground">클릭</span>
            <span className="ml-2">메인 스테이지에 열기 (현 메인은 교체됨)</span>
          </li>
          <li>
            <span className="rounded bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground">더블 클릭</span>
            <span className="ml-2">우측 서브 스테이지에 추가 (메인 보존)</span>
          </li>
          <li>
            <span className="rounded bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground">⌘ + 클릭</span>
            <span className="ml-2">우측에 추가 (더블 클릭 키보드 대안)</span>
          </li>
          <li>
            <span className="rounded bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground">드래그 → 우측</span>
            <span className="ml-2">우측에 추가</span>
          </li>
        </ul>
        <div className="mt-3 border-t border-border/50 pt-2 text-[11px] text-muted-foreground/80">
          현 메인을 보존하고 다른 항목을 메인으로 가져오려면 메인 헤더의 ↗ 를 먼저 누르세요.
        </div>
      </div>
    </div>
  );
}
