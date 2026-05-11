import { AlertTriangle, Clock, History, Loader2, ScrollText, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Skeleton } from '../../../ui/Skeleton';
import { useAiSessionStore } from '../../../../stores/aiSessionStore';
import { PinnedEpisodeBox } from './PinnedEpisodeBox';
import { formatHistoryTime, type EpisodeInfo } from './types';

/* ── 회차 요약 생성: 입력 화면 (회차 등록 + 즉시 실행 버튼) ── */

export function SummarizeInputScreen({
  episode,
  hasPinned,
  canRegisterCurrent,
  onClearPinned,
  onRegisterCurrent,
  selectedWorkId,
  onStartSummarize,
}: {
  episode: EpisodeInfo | null;
  hasPinned: boolean;
  canRegisterCurrent: boolean;
  onClearPinned: () => void;
  onRegisterCurrent: () => void;
  selectedWorkId: string | null;
  onStartSummarize: () => void;
}) {
  const summarizeHistory = useAiSessionStore((s) => s.summarizeHistory);
  const viewSummarizeHistory = useAiSessionStore((s) => s.viewSummarizeHistory);
  const deleteSummarizeHistory = useAiSessionStore((s) => s.deleteSummarizeHistory);
  const summarizeState = useAiSessionStore((s) => s.summarizeState);

  const filteredHistory = selectedWorkId
    ? summarizeHistory.filter((h) => h.workId === selectedWorkId)
    : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        <PinnedEpisodeBox
          episode={episode}
          hasPinned={hasPinned}
          canRegisterCurrent={canRegisterCurrent}
          onClearPinned={onClearPinned}
          onRegisterCurrent={onRegisterCurrent}
        />

        {hasPinned && episode && (
          !episode.content ? (
            <div className="rounded-md bg-muted/50 px-3 py-4 text-center text-xs text-muted-foreground">
              원고 내용이 없습니다. 먼저 원고를 작성해주세요.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={onStartSummarize}
                disabled={summarizeState === 'loading'}
                className="flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                <ScrollText size={13} strokeWidth={1.75} />
                {summarizeState === 'loading' ? '요약 생성 중...' : '회차 요약 생성'}
              </button>
              <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
                자세한 사용법은 우측 상단 <span className="font-medium">?</span> 도움말을 참고하세요.
              </p>
            </div>
          )
        )}

        {filteredHistory.length > 0 && (
          <div className="mt-2">
            <div className="flex items-center gap-1.5 px-1 pb-1.5">
              <History size={13} className="text-muted-foreground" strokeWidth={1.75} />
              <span className="text-xs font-medium text-muted-foreground">요약 생성 기록</span>
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
                    onClick={() => viewSummarizeHistory(entry.id)}
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
                      <span className="truncate">{entry.result.oneline_summary || ''}</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteSummarizeHistory(entry.id)}
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

/* ── 회차 요약 생성: 결과 화면 (12-필드 카드 표시) ── */

export function SummarizeResultScreen({ onBack, isHistoryView }: { onBack: () => void; isHistoryView?: boolean }) {
  const state = useAiSessionStore((s) => s.summarizeState);
  const result = useAiSessionStore((s) => s.summarizeResult);
  const error = useAiSessionStore((s) => s.summarizeError);
  const targetEpisode = useAiSessionStore((s) => s.summarizeTargetEpisode);
  void onBack; // 헤더가 처리

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {targetEpisode && (
          <div className="rounded-md bg-muted/50 px-3 py-2">
            <span className="text-xs text-muted-foreground">대상 원고</span>
            <p className="mt-0.5 truncate text-sm font-medium text-foreground">
              {targetEpisode.title?.trim() || '(제목 없음)'}
            </p>
          </div>
        )}

        {state === 'loading' && (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex flex-col gap-2 rounded-md border border-border bg-background p-3">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ))}
            <div className="flex items-center justify-center gap-2 pt-1">
              <Loader2 size={14} className="animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">요약을 생성하는 중...</span>
            </div>
          </div>
        )}

        {state === 'error' && (
          <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-xs text-danger">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span className="leading-relaxed">{error || '요약 생성에 실패했습니다.'}</span>
          </div>
        )}

        {state === 'done' && result && (
          <SummarizeResultBody result={result} isHistoryView={isHistoryView} />
        )}
      </div>
    </div>
  );
}

function SummarizeResultBody({
  result,
  isHistoryView,
}: {
  result: import('../../../../stores/aiSessionStore').SummarizeResult;
  isHistoryView?: boolean;
}) {
  const cached = result.cached === true;
  return (
    <div className="flex flex-col gap-3">
      {!isHistoryView && cached && (
        <div className="rounded-md bg-info-soft px-3 py-2 text-[11px] text-info">
          본문이 변경되지 않아 저장된 요약을 즉시 불러왔습니다 (크레딧 0).
        </div>
      )}

      {/* 한 줄 요약 — 강조 박스 */}
      {result.oneline_summary && (
        <SummaryField label="한 줄 요약" emphasis>
          {result.oneline_summary}
        </SummaryField>
      )}

      {/* 본문 요약 (3 문장) */}
      {result.summary && (
        <SummaryField label="요약">
          <p className="whitespace-pre-wrap leading-relaxed">{result.summary}</p>
        </SummaryField>
      )}

      <div className="grid grid-cols-2 gap-2">
        {result.pov_character && (
          <SummaryField label="시점 인물">{result.pov_character}</SummaryField>
        )}
        {result.tone && <SummaryField label="톤">{result.tone}</SummaryField>}
      </div>

      {result.present_characters?.length > 0 && (
        <SummaryField label="등장 인물">
          <SummaryChips items={result.present_characters} />
        </SummaryField>
      )}

      {result.present_locations?.length > 0 && (
        <SummaryField label="등장 장소">
          <SummaryChips items={result.present_locations} />
        </SummaryField>
      )}

      {result.key_events?.length > 0 && (
        <SummaryField label="핵심 사건">
          <ol className="ml-3 list-decimal space-y-1">
            {[...result.key_events]
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
              .map((ev, i) => (
                <li key={i} className="text-xs leading-relaxed">{ev.event}</li>
              ))}
          </ol>
        </SummaryField>
      )}

      {result.time_progression && (
        <SummaryField label="시간 진행">{result.time_progression}</SummaryField>
      )}

      {result.cliffhanger && (
        <SummaryField label="끝점 / 절정">
          <p className="whitespace-pre-wrap leading-relaxed">{result.cliffhanger}</p>
        </SummaryField>
      )}

      {result.foreshadow_planted?.length > 0 && (
        <SummaryField label="심어진 복선">
          <ul className="space-y-1">
            {result.foreshadow_planted.map((f, i) => (
              <li key={i} className="text-xs leading-relaxed">
                <span className="font-medium">{f.name}</span>
                {f.description ? <span className="text-muted-foreground"> — {f.description}</span> : null}
              </li>
            ))}
          </ul>
        </SummaryField>
      )}

      {result.foreshadow_paid_off?.length > 0 && (
        <SummaryField label="회수된 복선">
          <SummaryChips items={result.foreshadow_paid_off.map((f) => f.name)} />
        </SummaryField>
      )}

      {result.keywords?.length > 0 && (
        <SummaryField label="키워드">
          <SummaryChips items={result.keywords} />
        </SummaryField>
      )}
    </div>
  );
}

function SummaryField({
  label,
  children,
  emphasis,
}: {
  label: string;
  children: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div
      className={
        emphasis
          ? 'rounded-md border border-primary/30 bg-primary/5 p-3'
          : 'rounded-md border border-border bg-background p-3'
      }
    >
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className={emphasis ? 'mt-1 text-sm font-medium text-foreground' : 'mt-1 text-xs text-foreground'}>
        {children}
      </div>
    </div>
  );
}

function SummaryChips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {items.filter(Boolean).map((item, i) => (
        <span
          key={i}
          className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-foreground"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

/* ── 문서 생성: 입력 화면 (자유 프롬프트 + 참고 회차 선택) ── */
