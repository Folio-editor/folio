// ============================================================
// EmptyMainState — 활성 메인 탭이 없을 때 표시되는 안내
// ============================================================
// 다중 탭 모델: 메인 탭이 모두 닫혀있거나 빈 탭 상태에서 노출.
// 사이드바 클릭으로 탭을 채우라는 가이드 + 다중 탭 인터랙션 안내.
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
  plot:           { label: '플롯',     hint: '좌측에서 막·회차를 선택하거나 "전체"로 흐름을 한눈에 확인하세요.' },
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
            <span className="ml-2">활성 탭 교체 (현 탭의 문서가 바뀜)</span>
          </li>
          <li>
            <span className="rounded bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground">⌘ / Ctrl + 클릭</span>
            <span className="ml-2">새 탭으로 열기</span>
          </li>
          <li>
            <span className="rounded bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground">더블 클릭</span>
            <span className="ml-2">우측 보조 패널에 추가 (메인 보존)</span>
          </li>
          <li>
            <span className="rounded bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground">드래그 → 우측</span>
            <span className="ml-2">우측 보조 패널에 추가</span>
          </li>
        </ul>
        <div className="mt-3 border-t border-border/50 pt-2 text-[11px] text-muted-foreground/80">
          탭 닫기 <span className="font-mono">×</span> · <span className="font-mono">Ctrl+W</span> /
          {' '}새 탭 <span className="font-mono">+</span> · <span className="font-mono">Ctrl+T</span> /
          {' '}탭 전환 <span className="font-mono">Ctrl+Tab</span>
        </div>
      </div>
    </div>
  );
}
