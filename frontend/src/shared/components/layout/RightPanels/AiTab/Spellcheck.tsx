import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Clock, History, Loader2, SpellCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '../../../ui/Skeleton';
import { useAiSessionStore } from '../../../../stores/aiSessionStore';
import { useProgressMessage } from '../../../../hooks/useProgressMessage';
import { getRegisteredEditor } from '../../../../lib/activeEditorRegistry';
import { PinnedEpisodeBox } from './PinnedEpisodeBox';
import { formatHistoryTime, type EpisodeInfo } from './types';
import { AiErrorBlock } from '../errors';
import { cn } from '../../../../lib/cn';

/* ── 맞춤법 검사: 입력 화면 ── */

export function SpellcheckInputScreen({
  episode,
  hasPinned,
  canRegisterCurrent,
  onClearPinned,
  onRegisterCurrent,
  selectedWorkId,
  onStartSpellcheck,
}: {
  episode: EpisodeInfo | null;
  hasPinned: boolean;
  canRegisterCurrent: boolean;
  onClearPinned: () => void;
  onRegisterCurrent: () => void;
  selectedWorkId: string | null;
  onStartSpellcheck: (mode?: 'episode' | 'selection') => void;
}) {
  const spellcheckHistory = useAiSessionStore((s) => s.spellcheckHistory);
  const viewSpellcheckHistory = useAiSessionStore((s) => s.viewSpellcheckHistory);
  const deleteSpellcheckHistory = useAiSessionStore((s) => s.deleteSpellcheckHistory);
  const spellcheckState = useAiSessionStore((s) => s.spellcheckState);

  // 등록된 에디터의 선택 상태를 구독 — 비어있지 않은 영역이 선택돼 있을 때만 '선택 영역 검사' 버튼 활성화
  const [hasNonEmptySelection, setHasNonEmptySelection] = useState(false);
  useEffect(() => {
    if (!episode) {
      setHasNonEmptySelection(false);
      return;
    }
    const editor = getRegisteredEditor(episode.id);
    if (!editor) {
      setHasNonEmptySelection(false);
      return;
    }
    const update = () => setHasNonEmptySelection(!editor.state.selection.empty);
    update();
    editor.on('selectionUpdate', update);
    editor.on('transaction', update);
    return () => {
      editor.off('selectionUpdate', update);
      editor.off('transaction', update);
    };
  }, [episode]);

  const filteredHistory = selectedWorkId
    ? spellcheckHistory.filter((h) => h.workId === selectedWorkId)
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
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => onStartSpellcheck('episode')}
                disabled={spellcheckState === 'loading'}
                className="flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                <SpellCheck size={13} strokeWidth={1.75} />
                회차 전체 맞춤법 검사
              </button>
              <button
                type="button"
                onClick={() => onStartSpellcheck('selection')}
                disabled={spellcheckState === 'loading' || !hasNonEmptySelection}
                title={hasNonEmptySelection ? '선택한 영역만 검사' : '본문에서 검사할 텍스트를 드래그로 선택하세요'}
                className="flex h-9 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                <SpellCheck size={13} strokeWidth={1.75} />
                {hasNonEmptySelection ? '선택 영역만 검사' : '선택 영역만 검사 (드래그 필요)'}
              </button>
            </div>
          )
        )}

        {filteredHistory.length > 0 && (
          <div className="mt-2">
            <div className="flex items-center gap-1.5 px-1 pb-1.5">
              <History size={13} className="text-muted-foreground" strokeWidth={1.75} />
              <span className="text-xs font-medium text-muted-foreground">맞춤법 검사 기록</span>
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
                    onClick={() => viewSpellcheckHistory(entry.id)}
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
                      <span>이슈 {entry.result.issues.length}건</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteSpellcheckHistory(entry.id)}
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

const CIRCLED_NUMBERS = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
function circledNumber(n: number): string {
  if (n >= 1 && n <= 20) return CIRCLED_NUMBERS[n - 1];
  return `(${n})`;
}

/** SpellcheckIssue.type → 사용자에게 보여줄 한글 라벨. ai/app/api/v1/spellcheck.py 의 _TYPE_LABEL 과 정합. */
const SPELLCHECK_TYPE_LABELS: Record<string, string> = {
  typo: '오탈자',
  spacing: '띄어쓰기',
  punctuation: '문장부호',
};

/* Phase 7: SEVERITY_STYLE + ReviewResultScreen 제거됨 — legacy /ai/reviews 흐름 폐기. */

/**
 * 블록별로 내부 text node 들을 한 문자열로 평탄화한 뒤 search.
 * mark 로 인한 text node 분할과 LLM 의 잘못된 line 번호를 동시에 흡수.
 * normalizeWhitespace=true 면 양쪽 모두 NBSP/전각공백 등 모든 whitespace 를 일반 공백으로 환산.
 */
function findFlattenedInDoc(
  doc: import('@tiptap/pm/model').Node,
  term: string,
  normalizeWhitespace: boolean,
): { from: number; to: number } | null {
  if (!term) return null;
  const needle = normalizeWhitespace ? term.replace(/\s/g, ' ') : term;
  let result: { from: number; to: number } | null = null;

  doc.forEach((blockNode, blockOffset) => {
    if (result) return;
    const positions: number[] = [];
    let flat = '';
    blockNode.descendants((node, posInBlock) => {
      if (node.isText && node.text) {
        for (let i = 0; i < node.text.length; i++) {
          const ch = node.text[i];
          flat += normalizeWhitespace && /\s/.test(ch) ? ' ' : ch;
          positions.push(blockOffset + 1 + posInBlock + i);
        }
      }
    });
    const idx = flat.indexOf(needle);
    if (idx !== -1) {
      result = {
        from: positions[idx],
        to: positions[idx + needle.length - 1] + 1,
      };
    }
  });

  return result;
}

export function SpellcheckResultScreen({ onBack, isHistoryView }: { onBack: () => void; isHistoryView?: boolean }) {
  const spellcheckState = useAiSessionStore((s) => s.spellcheckState);
  const result = useAiSessionStore((s) => s.spellcheckResult);
  const error = useAiSessionStore((s) => s.spellcheckError);
  const targetEpisode = useAiSessionStore((s) => s.spellcheckTargetEpisode);
  const appliedIssues = useAiSessionStore((s) => s.spellcheckAppliedIssues);
  const markApplied = useAiSessionStore((s) => s.markSpellcheckIssueApplied);
  const setHovered = useAiSessionStore((s) => s.setSpellcheckHoveredIssue);
  const progressMessage = useProgressMessage(spellcheckState === 'loading', [
    { at: 0, message: '맞춤법을 확인하는 중...' },
    { at: 5000, message: '고유명사를 보호하며 검사하는 중...' },
    { at: 12000, message: '결과를 정리하는 중...' },
  ]);

  const handleApplyIssue = useCallback(
    (index: number, issue: { line: number; original: string; suggestion: string }) => {
      if (!targetEpisode) return;
      const editor = getRegisteredEditor(targetEpisode.id);
      if (!editor) {
        toast.error('본문 에디터가 열려 있지 않습니다', {
          description: '대상 회차를 본문에 열고 다시 시도해주세요.',
        });
        return;
      }

      const doc = editor.state.doc;
      const selRange = useAiSessionStore.getState().spellcheckSelectionRange;
      let target: { from: number; to: number } | null = null;

      if (selRange) {
        // 선택 영역 모드: 그 범위 안에서 original 첫 매치만 검색 (line 무시)
        doc.nodesBetween(selRange.from, selRange.to, (node, pos) => {
          if (target) return false;
          if (node.isText && node.text) {
            const nodeStart = pos;
            const nodeEnd = pos + node.text.length;
            const sliceStart = Math.max(selRange.from, nodeStart) - nodeStart;
            const sliceEnd = Math.min(selRange.to, nodeEnd) - nodeStart;
            if (sliceStart >= sliceEnd) return;
            const slice = node.text.slice(sliceStart, sliceEnd);
            const idx = slice.indexOf(issue.original);
            if (idx !== -1) {
              const from = nodeStart + sliceStart + idx;
              target = { from, to: from + issue.original.length };
              return false;
            }
          }
        });
      } else {
        // Tier 1: N번째 블록 안의 단일 text node 에서 정확 매치 (가장 정밀)
        let lineCount = 0;
        doc.forEach((blockNode, blockOffset) => {
          lineCount++;
          if (lineCount !== issue.line || target) return;
          blockNode.descendants((node, posInBlock) => {
            if (target) return false;
            if (node.isText && node.text) {
              const idx = node.text.indexOf(issue.original);
              if (idx !== -1) {
                const from = blockOffset + 1 + posInBlock + idx;
                target = { from, to: from + issue.original.length };
                return false;
              }
            }
          });
        });

        // Tier 2: 모든 블록을 순회하면서 블록 내부 텍스트를 평탄화해 검색.
        // - LLM 의 line 번호 오류 (잘못된 paragraph 지목) 흡수
        // - inline mark 로 인한 text node 분할 (e.g. "한 " | "꺼번에") 흡수
        if (!target) {
          target = findFlattenedInDoc(doc, issue.original, false);
        }

        // Tier 3: whitespace 정규화 (NBSP/전각공백 → 일반공백) 후 재검색.
        // LLM 이 보낸 original 의 공백과 본문 공백이 다른 경우.
        if (!target) {
          target = findFlattenedInDoc(doc, issue.original, true);
        }
      }

      if (!target) {
        toast.error('원문을 찾지 못했습니다', {
          description: '본문이 변경되어 위치를 특정할 수 없습니다.',
        });
        return;
      }

      editor.chain().focus().insertContentAt(target, issue.suggestion).run();
      markApplied(index);
    },
    [targetEpisode, markApplied],
  );

  void onBack;

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

        {spellcheckState === 'loading' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex flex-col gap-2 rounded-md border border-border bg-background p-3">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-center gap-2 pt-1">
              <Loader2 size={14} className="animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">{progressMessage}</span>
            </div>
          </div>
        )}

        {spellcheckState === 'done' && result && (
          <div className="flex flex-col gap-3">
            <div className="rounded-md border border-border bg-background p-3">
              <span className="text-xs font-medium text-muted-foreground">검사 요약</span>
              <p className="mt-2 text-xs text-muted-foreground">{result.summary}</p>
            </div>

            {result.issues.length === 0 ? (
              <div className="flex items-center gap-2 rounded-md bg-success-soft px-3 py-3 text-sm text-success">
                <Check size={16} strokeWidth={2} />
                맞춤법 검사에서 발견된 문제가 없습니다.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  발견된 이슈 ({result.issues.length}건)
                </span>
                {result.issues.map((issue, i) => {
                  const applied = appliedIssues.includes(i);
                  return (
                    <div
                      key={`${issue.line}-${issue.original}-${i}`}
                      onMouseEnter={() => !applied && setHovered(i)}
                      onMouseLeave={() => setHovered(null)}
                      className={cn(
                        'rounded-md border border-border bg-background p-3 text-left transition-opacity',
                        applied && 'opacity-50',
                      )}
                    >
                      <div className="mb-2 flex items-center gap-1.5">
                        <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                          {circledNumber(i + 1)}
                        </span>
                        <span className="text-xs font-semibold">{SPELLCHECK_TYPE_LABELS[issue.type] ?? issue.type}</span>
                        <span className="text-xs text-muted-foreground">{issue.line}줄</span>
                      </div>
                      <div className="flex flex-col gap-1.5 text-xs">
                        <p>
                          <span className="font-medium text-muted-foreground">원문:</span>{' '}
                          <span className={cn('text-foreground', applied && 'line-through')}>{issue.original}</span>
                        </p>
                        <p>
                          <span className="font-medium text-muted-foreground">제안:</span>{' '}
                          <span className="text-primary">{issue.suggestion}</span>
                        </p>
                        {issue.reason && (
                          <p className="text-muted-foreground">{issue.reason}</p>
                        )}
                      </div>
                      {!isHistoryView && (
                        <div className="mt-2 flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleApplyIssue(i, issue)}
                            disabled={applied}
                            className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {applied ? '적용됨' : '적용'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {spellcheckState === 'error' && error && (
          <AiErrorBlock message={error} />
        )}
      </div>
    </div>
  );
}
