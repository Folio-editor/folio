import { Clock, History, SearchCheck, X } from 'lucide-react';
import { useAiSessionStore } from '../../../../stores/aiSessionStore';
import { CardlessInput, CARDLESS_INPUT_CLASS } from './CardlessInput';
import { PinnedEpisodeBox } from './PinnedEpisodeBox';
import { formatHistoryTime, type EpisodeInfo } from './types';
import { cn } from '../../../../lib/cn';

/* ── 원고 검수: 입력 화면 (다회차 선택 + 자유 prompt → agent thread) ── */

export function ReviewInputScreen({
  episode,
  hasPinned,
  canRegisterCurrent,
  onClearPinned,
  onRegisterCurrent,
  selectedWorkId,
  onStartReview,
  onBack: _onBack,
}: {
  episode: EpisodeInfo | null;
  hasPinned: boolean;
  canRegisterCurrent: boolean;
  onClearPinned: () => void;
  onRegisterCurrent: () => void;
  selectedWorkId: string | null;
  onStartReview: () => void;
  onBack: () => void;
}) {
  const reviewHistory = useAiSessionStore((s) => s.reviewHistory);
  const viewReviewHistory = useAiSessionStore((s) => s.viewReviewHistory);
  const deleteReviewHistory = useAiSessionStore((s) => s.deleteReviewHistory);

  const focusPrompt = useAiSessionStore((s) => s.reviewFocusPrompt);
  const setFocusPrompt = useAiSessionStore((s) => s.setReviewFocusPrompt);

  const canStart = !!episode && !!selectedWorkId;

  const filteredHistory = selectedWorkId
    ? reviewHistory.filter((h) => h.workId === selectedWorkId)
    : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {/* 검수 대상 원고 — 맞춤법/요약 카드와 동일한 PinnedEpisodeBox (좌측 사이드바 선택 자동 동기화) */}
        <PinnedEpisodeBox
          episode={episode}
          hasPinned={hasPinned}
          canRegisterCurrent={canRegisterCurrent}
          onClearPinned={onClearPinned}
          onRegisterCurrent={onRegisterCurrent}
        />

        {/* 중점 사항 — 자유 prompt (외곽 카드 X, 깔끔한 input-only) */}
        {hasPinned && episode && (
          <CardlessInput
            label="검수 시 중점 사항 (선택)"
            help="비워두면 일반 검수를 진행합니다."
          >
            <textarea
              value={focusPrompt}
              onChange={(e) => setFocusPrompt(e.target.value)}
              rows={4}
              maxLength={1500}
              placeholder="특별히 점검할 부분이 있다면 자유롭게 적어주세요."
              className={CARDLESS_INPUT_CLASS}
            />
          </CardlessInput>
        )}

        {hasPinned && episode && (
          <>
            <button
              type="button"
              onClick={onStartReview}
              disabled={!canStart}
              className="flex h-10 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              <SearchCheck size={14} strokeWidth={1.75} />
              검수 시작
            </button>
            <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
              자세한 사용법은 우측 상단 <span className="font-medium">?</span> 도움말을 참고하세요.
            </p>
          </>
        )}

        {/* 검수 히스토리 목록 */}
        {filteredHistory.length > 0 && (
          <div className="mt-2">
            <div className="flex items-center gap-1.5 px-1 pb-1.5">
              <History size={13} className="text-muted-foreground" strokeWidth={1.75} />
              <span className="text-xs font-medium text-muted-foreground">검수 기록</span>
              <span className="text-xs text-muted-foreground/60">{filteredHistory.length}/{10}</span>
            </div>
            <div className="flex flex-col gap-1">
              {filteredHistory.map((entry) => (
                <div
                  key={entry.id}
                  className="group flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 transition-colors hover:border-border hover:bg-accent/20"
                >
                  <button
                    type="button"
                    onClick={() => viewReviewHistory(entry.id)}
                    className="flex min-w-0 flex-1 flex-col text-left"
                  >
                    <span className="truncate text-xs font-medium text-foreground">
                      {entry.episode.title?.trim() || '(제목 없음)'}
                    </span>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground/60">
                      <span className="flex items-center gap-0.5">
                        <Clock size={9} />
                        {formatHistoryTime(entry.createdAt)}
                      </span>
                      <span className={cn(
                        'font-medium',
                        entry.result.score >= 80 ? 'text-success' : entry.result.score >= 50 ? 'text-warning' : 'text-danger',
                      )}>
                        {entry.result.score}점
                      </span>
                      <span>이슈 {entry.result.issues.length}건</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteReviewHistory(entry.id)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/40 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                    title="삭제"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── 원고 검수: 결과 화면 (로딩/결과/에러 표시) ── */
