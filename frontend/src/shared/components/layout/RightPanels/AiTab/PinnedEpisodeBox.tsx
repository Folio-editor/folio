import { X } from 'lucide-react';
import type { EpisodeInfo } from './types';

/* ── AI 대상 원고 박스 (Review/Spell/Summarize 공통) ── */

export function PinnedEpisodeBox({
  episode,
  hasPinned,
  canRegisterCurrent,
  onClearPinned,
  onRegisterCurrent,
}: {
  episode: EpisodeInfo | null;
  hasPinned: boolean;
  canRegisterCurrent: boolean;
  onClearPinned: () => void;
  onRegisterCurrent: () => void;
}) {
  if (hasPinned && episode) {
    return (
      <div className="flex items-start justify-between gap-2 rounded-md bg-muted/50 px-3 py-2">
        <div className="min-w-0 flex-1">
          <span className="text-xs text-muted-foreground">대상 원고</span>
          <p className="mt-0.5 truncate text-sm font-medium text-foreground">
            {episode.title?.trim() || '(제목 없음)'}
          </p>
          {canRegisterCurrent && (
            <button
              type="button"
              onClick={onRegisterCurrent}
              className="mt-1 text-[11px] text-primary hover:underline"
              title="메인 탭의 현재 원고로 교체"
            >
              현재 메인 원고로 교체
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onClearPinned}
          title="원고 등록 취소"
          aria-label="원고 등록 취소"
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  // 미등록 상태 — 메인 탭에 episode가 있으면 등록 버튼, 아니면 안내
  return (
    <div className="rounded-md bg-muted/50 px-3 py-2">
      <span className="text-xs text-muted-foreground">대상 원고</span>
      {canRegisterCurrent ? (
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">등록된 원고가 없습니다.</p>
          <button
            type="button"
            onClick={onRegisterCurrent}
            className="shrink-0 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
          >
            현재 원고 등록
          </button>
        </div>
      ) : (
        <p className="mt-0.5 text-sm text-muted-foreground">
          좌측에서 원고를 선택해주세요
        </p>
      )}
    </div>
  );
}

