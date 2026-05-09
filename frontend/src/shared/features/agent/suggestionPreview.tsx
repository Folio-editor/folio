/**
 * Agent suggestion 본문 (payload) 미리보기 컴포넌트.
 *
 * - useDecryptedSuggestionPayload: payload 안의 v1: ciphertext 를 deep-walk 해 평문화
 * - SuggestionPreview: entity_type 별 본문 렌더 + 승인/거절 버튼
 *
 * AgentChatPanel(스레드 응답 직후 미리보기) + SuggestionInbox(작업물 탭) 양쪽에서 공용.
 */

import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { useQuery } from '@powersync/react';

import { decryptWorkFieldOnce, isCipher } from '../../crypto/fieldDecrypt';
import type { AgentSuggestion } from '../../api/agent';
import { useMainTabsStore } from '../../stores/mainTabsStore';
import { useReviewHighlightStore } from '../../stores/reviewHighlightStore';
import { ChatMarkdown } from './ChatMarkdown';

const ENTITY_LABEL: Record<string, string> = {
  character: '인물 추가',
  character_update: '인물 수정',
  character_delete: '인물 삭제',
  world_note: '세계관 추가',
  world_note_update: '세계관 수정',
  world_note_delete: '세계관 삭제',
  plot_revision: '플롯 수정',
  plot_create: '플롯 추가',
  plot_tree: '챕터 + 하위 플롯',
  plot_delete: '플롯 삭제',
  episode_draft: '회차 초안',
  episode_update: '회차 수정',
  episode_delete: '회차 삭제',
  review_issue: '검수 발견',
  spelling_fix: '맞춤법 수정',
  spelling_batch: '맞춤법 일괄',
};

export function entityLabel(entityType: string): string {
  return ENTITY_LABEL[entityType] ?? entityType;
}

/**
 * payload 안의 v1: 문자열을 재귀적으로 평문화.
 * 폴백: KEK 부재 / encrypted_dek 부재 / 복호화 실패 → ciphertext 그대로 두어 UI 깨짐 방지.
 *
 * 2026-05-09: extraction_suggestion 의 suggested_name + reviewer_note 도 v1: 가능 →
 * 호출처에서 wrapper {suggested_name, payload, reviewer_note} 로 묶어 한 번에 복호화 권장.
 */
export function useDecryptedSuggestionPayload(
  workId: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const { data: workRows = [] } = useQuery<{ encrypted_dek: string | null }>(
    `SELECT encrypted_dek FROM work WHERE id = ?`,
    [workId],
  );
  const encryptedDek = workRows[0]?.encrypted_dek ?? null;

  // ⚠ 호출자가 매 렌더마다 새 payload 객체를 만들면 (wrapper 패턴) useEffect 가 무한 발화 →
  // 무한 setState 루프 → 메인 스레드 블록 → 클릭 무반응. JSON 직렬화 키로 deep-equality 안정화.
  const payloadKey = useMemo(() => {
    try {
      return JSON.stringify(payload);
    } catch {
      return String(payload);
    }
  }, [payload]);

  const [decrypted, setDecrypted] = useState<Record<string, unknown>>(payload);

  useEffect(() => {
    let cancelled = false;

    async function walk(value: unknown): Promise<unknown> {
      if (typeof value === 'string') {
        if (!isCipher(value)) return value;
        return await decryptWorkFieldOnce({ workId, encryptedDek, value });
      }
      if (Array.isArray(value)) {
        return await Promise.all(value.map(walk));
      }
      if (value && typeof value === 'object') {
        const entries = await Promise.all(
          Object.entries(value as Record<string, unknown>).map(
            async ([k, v]) => [k, await walk(v)] as const,
          ),
        );
        return Object.fromEntries(entries);
      }
      return value;
    }

    (async () => {
      const next = (await walk(payload)) as Record<string, unknown>;
      if (!cancelled) setDecrypted(next);
    })();

    return () => {
      cancelled = true;
    };
    // payloadKey (JSON 직렬화) 만 deps — payload reference 변경 무시. workId/encryptedDek 추가.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payloadKey, workId, encryptedDek]);

  return decrypted;
}

/**
 * suggestion 의 모든 ciphertext 필드 (suggested_name + payload + reviewer_note) 를
 * 한 번에 deep-walk 복호화. listSuggestion 의 카드 헤더용으로도 사용.
 */
export function useDecryptedSuggestion(s: AgentSuggestion): {
  suggested_name: string;
  payload: Record<string, unknown>;
  reviewer_note: string | null;
} {
  // wrapper 객체 reference 안정화 — 무한 렌더 루프 차단 (deps 비교는 hook 내부 JSON 키로도
  // 보호되지만 1차로 reference 안정화하면 stringify 자체도 1회만 수행).
  const wrapper = useMemo(
    () => ({
      suggested_name: s.suggested_name,
      payload: s.payload,
      reviewer_note: s.reviewer_note,
    }),
    [s.suggested_name, s.payload, s.reviewer_note],
  );
  const wrapped = useDecryptedSuggestionPayload(s.work_id, wrapper);
  return {
    suggested_name:
      typeof wrapped.suggested_name === 'string' ? wrapped.suggested_name : s.suggested_name,
    payload: (wrapped.payload as Record<string, unknown>) ?? s.payload,
    reviewer_note:
      typeof wrapped.reviewer_note === 'string' ? wrapped.reviewer_note : s.reviewer_note,
  };
}

/**
 * suggestion 본문 렌더 (entity_type 별 분기). pending 상태일 때 승인/거절 버튼 함께 표시.
 *
 * SuggestionInbox 에선 work_id 가 항목마다 다를 수 있어 s.work_id 를 그대로 workId 로 전달.
 */
// 인물 필드 한글 라벨 — 'role'·'intro' 같은 영문 키 대신 작가가 직관 인지.
const CHARACTER_FIELD_LABEL: Record<string, string> = {
  name: '이름',
  role: '역할',
  gender: '성별',
  age: '나이',
  intro: '소개',
  appearance: '외형',
  personality: '성격',
  notes: '메모',
};

// markdown 으로 렌더할 자유 서술 필드 (intro/notes 등). 짧은 라벨 (이름·성별) 은 평문.
const CHARACTER_MARKDOWN_FIELDS = new Set(['intro', 'appearance', 'personality', 'notes']);

export function SuggestionBodyPreview({
  s,
  workId,
  busy,
  onApprove,
  onReject,
  hideActions = false,
  batchChecked,
  onBatchCheckedChange,
}: {
  s: AgentSuggestion;
  workId: string;
  busy: boolean;
  /** spelling_batch 일 때 selectedIndices 배열 전달 — 작가가 체크한 fix idx. 다른 type 은 미전달. */
  onApprove: (selectedIndices?: number[]) => void;
  onReject: () => void;
  /** 외부 footer 가 액션을 제공하는 경우 (예: ReviewOverlay) 내장 거절/승인 행 숨김. */
  hideActions?: boolean;
  /** spelling_batch 의 체크 상태를 부모가 직접 관리할 때 (overlay footer 통합). */
  batchChecked?: Set<number>;
  onBatchCheckedChange?: (next: Set<number>) => void;
}) {
  const p = useDecryptedSuggestionPayload(workId, s.payload);
  return (
    <div className="space-y-1.5 text-[11px]">
      {s.entity_type === 'episode_draft' && (
        <>
          <div>
            <strong className="text-muted-foreground">제목</strong> · {String(p.title ?? '')}
          </div>
          <div className="rounded bg-muted/30 p-2">
            <ChatMarkdown text={String(p.content ?? '')} />
          </div>
        </>
      )}
      {s.entity_type === 'world_note' && (
        <>
          <div>
            <strong className="text-muted-foreground">이름</strong> · {String(p.name ?? '')}
          </div>
          <div className="rounded bg-muted/30 p-2">
            <ChatMarkdown text={String(p.content ?? '')} />
          </div>
        </>
      )}
      {s.entity_type === 'character' && (
        <div className="space-y-1.5">
          {(['name', 'role', 'gender', 'age', 'intro', 'appearance', 'personality', 'notes'] as const).map(
            (k) => {
              const v = p[k];
              if (!v) return null;
              const label = CHARACTER_FIELD_LABEL[k] ?? k;
              const isMarkdown = CHARACTER_MARKDOWN_FIELDS.has(k);
              return (
                <div key={k}>
                  <div className="text-[10px] font-medium text-muted-foreground">{label}</div>
                  {isMarkdown ? (
                    <div className="mt-0.5 rounded bg-muted/20 px-2 py-1">
                      <ChatMarkdown text={String(v)} />
                    </div>
                  ) : (
                    <div className="mt-0.5">{String(v)}</div>
                  )}
                </div>
              );
            },
          )}
        </div>
      )}
      {s.entity_type === 'plot_tree' && (
        <div className="space-y-1.5">
          <div>
            <strong>📁 {String((p.root as Record<string, unknown>)?.title ?? s.suggested_name)}</strong>
          </div>
          {Boolean((p.root as Record<string, unknown>)?.content) && (
            <div className="rounded bg-muted/30 p-2">
              <ChatMarkdown text={String((p.root as Record<string, unknown>).content)} />
            </div>
          )}
          <div className="ml-3 space-y-1 border-l border-border/60 pl-2">
            {Array.isArray(p.children) &&
              (p.children as Array<Record<string, unknown>>).map((c, i) => (
                <div key={i}>
                  <div className="text-[11px]">
                    └ <strong>{String(c.title ?? `(자식 ${i + 1})`)}</strong>
                  </div>
                  {Boolean(c.content) && (
                    <div className="ml-3 rounded bg-muted/20 px-2 py-1">
                      <ChatMarkdown text={String(c.content)} />
                    </div>
                  )}
                </div>
              ))}
          </div>
          <div className="text-[10px] text-muted-foreground">
            승인 시 부모 + 자식 {Array.isArray(p.children) ? p.children.length : 0}개 한꺼번에 작성됩니다.
          </div>
        </div>
      )}
      {(s.entity_type === 'character_update' ||
        s.entity_type === 'world_note_update' ||
        s.entity_type === 'episode_update' ||
        s.entity_type === 'plot_revision') && (
        <UpdatePayloadView payload={p} />
      )}
      {s.entity_type === 'review_issue' && (
        <ReviewIssueCard suggestion={s} payload={p} />
      )}
      {s.entity_type === 'spelling_fix' && (
        <SpellingFixCard payload={p} />
      )}
      {s.entity_type === 'spelling_batch' && (
        <SpellingBatchCard
          payload={p}
          status={s.status}
          busy={busy}
          onApply={(idxs) => onApprove(idxs)}
          onReject={onReject}
          controlledChecked={batchChecked}
          onCheckedChange={onBatchCheckedChange}
          hideActions={hideActions}
        />
      )}
      {(s.entity_type === 'character_delete' ||
        s.entity_type === 'world_note_delete' ||
        s.entity_type === 'episode_delete') && (
        <div className="rounded bg-red-500/10 p-2 text-[11px] text-red-600">
          ⚠ 삭제 — {String(p.reason ?? '(사유 없음)')}
        </div>
      )}
      {!hideActions && s.status === 'pending'
        && s.entity_type !== 'review_issue'
        && s.entity_type !== 'spelling_fix'
        && s.entity_type !== 'spelling_batch' && (
        <div className="mt-2 flex justify-end gap-1">
          <button
            type="button"
            onClick={onReject}
            disabled={busy}
            className="rounded border border-border px-2 py-0.5 text-[10px] hover:bg-accent disabled:opacity-50"
          >
            거절
          </button>
          <button
            type="button"
            onClick={() => onApprove()}
            disabled={busy}
            className="rounded bg-primary px-2 py-0.5 text-[10px] text-primary-foreground disabled:opacity-50"
          >
            ✓ 승인 (자동 작성)
          </button>
        </div>
      )}
      {/* spelling_fix — 1:1 자동 치환. 거절 = 무시, 승인 = 즉시 적용 */}
      {!hideActions && s.status === 'pending' && s.entity_type === 'spelling_fix' && (
        <div className="mt-2 flex justify-end gap-1">
          <button
            type="button"
            onClick={onReject}
            disabled={busy}
            className="rounded border border-border px-2 py-0.5 text-[10px] hover:bg-accent disabled:opacity-50"
            title="이 수정을 무시"
          >
            무시
          </button>
          <button
            type="button"
            onClick={() => onApprove()}
            disabled={busy}
            className="rounded bg-primary px-2 py-0.5 text-[10px] text-primary-foreground disabled:opacity-50"
            title="승인 시 본문에 즉시 자동 치환 (PowerSync sync)"
          >
            ✓ 적용
          </button>
        </div>
      )}
      {/* review_issue 는 자동 적용 X — 작가가 본문 수정한 뒤 닫음/무시 */}
      {!hideActions && s.status === 'pending' && s.entity_type === 'review_issue' && (
        <div className="mt-2 flex justify-end gap-1">
          <button
            type="button"
            onClick={onReject}
            disabled={busy}
            className="rounded border border-border px-2 py-0.5 text-[10px] hover:bg-accent disabled:opacity-50"
            title="이 발견을 무시"
          >
            무시
          </button>
          <button
            type="button"
            onClick={() => onApprove()}
            disabled={busy}
            className="rounded border border-border px-2 py-0.5 text-[10px] hover:bg-accent disabled:opacity-50"
            title="확인 처리 (자동 수정 안 함)"
          >
            ✓ 확인
          </button>
        </div>
      )}
    </div>
  );
}

// ─────── update 계열 payload 렌더 (character_update / world_note_update / episode_update / plot_revision) ───────
//
// JSON dump 대신 구조 키 / 자유 텍스트 분리해 사람이 읽기 좋은 폼.
// 자유 텍스트 (long string / markdown 후보) 는 ChatMarkdown 으로, 짧은 라벨은 평문.

const UPDATE_FIELD_LABEL: Record<string, string> = {
  character_id: '대상 인물',
  world_note_id: '대상 세계관',
  episode_id: '대상 회차',
  plot_id: '대상 플롯',
  field: '수정 필드',
  value: '새 값',
  name: '이름',
  title: '제목',
  role: '역할',
  intro: '소개',
  appearance: '외형',
  personality: '성격',
  notes: '메모',
  content: '본문',
  outline: '개요',
  new_outline: '개요',
  status: '상태',
  reason: '사유',
};

const UPDATE_MARKDOWN_KEYS = new Set([
  'value', 'intro', 'appearance', 'personality', 'notes', 'content', 'outline', 'new_outline',
]);

function UpdatePayloadView({ payload }: { payload: Record<string, unknown> }) {
  const entries = Object.entries(payload).filter(([, v]) => v !== null && v !== undefined && v !== '');
  if (entries.length === 0) {
    return <div className="rounded bg-muted/30 p-2 text-[10px] text-muted-foreground">변경 사항 없음</div>;
  }
  return (
    <div className="space-y-1.5">
      {entries.map(([k, v]) => {
        const label = UPDATE_FIELD_LABEL[k] ?? k;
        const isString = typeof v === 'string';
        const isMd = isString && UPDATE_MARKDOWN_KEYS.has(k);
        const text = isString ? v : JSON.stringify(v, null, 2);
        return (
          <div key={k}>
            <div className="text-[10px] font-medium text-muted-foreground">{label}</div>
            {isMd ? (
              <div className="mt-0.5 rounded bg-muted/20 px-2 py-1">
                <ChatMarkdown text={text} />
              </div>
            ) : isString ? (
              <div className="mt-0.5">{text}</div>
            ) : (
              <pre className="mt-0.5 overflow-auto rounded bg-muted/20 px-2 py-1 text-[10px]">{text}</pre>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────── 검수 발견 사항 카드 ───────

interface ReviewIssuePayload {
  episode_id?: string;
  lines?: number[];
  severity?: 'critical' | 'warning' | 'info';
  type?: string;
  description?: string;
  suggestion?: string | null;
}

const SEVERITY_LABEL: Record<string, { label: string; color: string }> = {
  critical: { label: '심각', color: 'bg-red-500/15 text-red-600' },
  warning: { label: '주의', color: 'bg-yellow-500/15 text-yellow-700' },
  info: { label: '제안', color: 'bg-blue-500/15 text-blue-600' },
};

const ISSUE_TYPE_LABEL: Record<string, string> = {
  setting_conflict: '설정 충돌',
  tone_conflict: '톤 충돌',
  foreshadow_unresolved: '미회수 복선',
  character_arc: '인물 행적',
  timeline: '시간선',
  other: '기타',
};

function ReviewIssueCard({
  suggestion,
  payload,
}: {
  suggestion: AgentSuggestion;
  payload: Record<string, unknown>;
}) {
  const p = payload as ReviewIssuePayload;
  const sev = p.severity && SEVERITY_LABEL[p.severity] ? SEVERITY_LABEL[p.severity] : SEVERITY_LABEL.info;
  const typeLabel = (p.type && ISSUE_TYPE_LABEL[p.type]) || ISSUE_TYPE_LABEL.other;
  const lines = Array.isArray(p.lines) ? p.lines : [];
  const linesLabel = lines.length === 0
    ? '본문 위치 미지정'
    : lines.length === 1
      ? `L${lines[0]}`
      : `L${lines[0]}~${lines[lines.length - 1]} (${lines.length}곳)`;
  const hasJump = !!p.episode_id && lines.length > 0;

  const openTab = useMainTabsStore((s) => s.openTab);
  const setHighlightIssues = useReviewHighlightStore((s) => s.setIssues);
  const focusHighlightIssue = useReviewHighlightStore((s) => s.focusIssue);

  function handleJump() {
    if (!hasJump || !p.episode_id) return;
    // 1) 메인 패널에 회차 오픈 (이미 열려있으면 점프)
    openTab({ section: 'episode', itemId: p.episode_id });
    // 2) ReviewHighlight 에 단일 이슈 세팅 + 포커스 — TipTap 확장이 흐릿한 데코 + scrollIntoView 자동 처리
    setHighlightIssues([
      {
        index: 0,
        type: p.type ?? 'other',
        severity: p.severity ?? 'info',
        lines,
        location: linesLabel,
        description: p.description ?? '',
      },
    ]);
    focusHighlightIssue(0);
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${sev.color}`}>
          {sev.label}
        </span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {typeLabel}
        </span>
        <span className="text-[10px] text-muted-foreground">{linesLabel}</span>
        {hasJump && suggestion.status === 'pending' && (
          <button
            type="button"
            onClick={handleJump}
            className="ml-auto flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] hover:bg-accent"
            title="메인 패널에서 본문 위치 보기"
          >
            <ArrowUpRight size={11} />
            본문에서 보기
          </button>
        )}
      </div>
      {p.description && (
        <div className="rounded bg-muted/30 p-2 text-[11px] leading-relaxed">
          {p.description}
        </div>
      )}
      {p.suggestion && (
        <div className="rounded border border-dashed border-border/60 bg-background p-2 text-[11px]">
          <span className="text-[10px] font-medium text-muted-foreground">💡 권고</span>
          <div className="mt-0.5 leading-relaxed">{p.suggestion}</div>
        </div>
      )}
    </div>
  );
}

// ─────── 맞춤법 일괄 체크리스트 카드 ───────

interface SpellingBatchFix {
  line?: number;
  original?: string;
  suggestion?: string;
  fix_type?: 'typo' | 'spacing' | 'punctuation';
  reason?: string | null;
}

interface SpellingBatchPayload {
  episode_id?: string;
  fixes?: SpellingBatchFix[];
}

function SpellingBatchCard({
  payload,
  status,
  busy,
  onApply,
  onReject,
  controlledChecked,
  onCheckedChange,
  hideActions = false,
}: {
  payload: Record<string, unknown>;
  status: 'pending' | 'confirmed' | 'rejected';
  busy: boolean;
  onApply: (selectedIndices: number[]) => void;
  onReject: () => void;
  /** 부모가 selection 을 직접 관리할 때 controlled 모드. (ReviewOverlay 의 외부 footer 통일용) */
  controlledChecked?: Set<number>;
  onCheckedChange?: (next: Set<number>) => void;
  /** 내부 액션 버튼 (전체 무시 / 선택 적용) 숨김 — 외부 footer 가 제공할 때 */
  hideActions?: boolean;
}) {
  const p = payload as SpellingBatchPayload;
  const fixes = Array.isArray(p.fixes) ? p.fixes : [];
  // controlled / uncontrolled 동시 지원. controlledChecked 있으면 그걸 사용, 없으면 내부 state.
  const [internalChecked, setInternalChecked] = useState<Set<number>>(
    () => new Set(fixes.map((_, i) => i)),
  );
  const checked = controlledChecked ?? internalChecked;
  const setChecked = (updater: (prev: Set<number>) => Set<number>) => {
    if (controlledChecked && onCheckedChange) {
      onCheckedChange(updater(controlledChecked));
    } else {
      setInternalChecked(updater);
    }
  };
  const allChecked = checked.size === fixes.length;
  const noneChecked = checked.size === 0;

  function toggle(i: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }
  function toggleAll() {
    setChecked((prev) =>
      prev.size === fixes.length ? new Set() : new Set(fixes.map((_, i) => i)),
    );
  }

  if (fixes.length === 0) {
    return (
      <div className="rounded bg-muted/30 p-2 text-[10px] text-muted-foreground">
        수정 항목 없음
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="text-[11px] text-muted-foreground">
          {status === 'pending'
            ? <><strong className="text-foreground">{checked.size}</strong> / {fixes.length} 선택됨</>
            : <>{fixes.length}건</>}
        </div>
        {status === 'pending' && (
          <button
            type="button"
            onClick={toggleAll}
            disabled={busy}
            className="text-[10px] text-primary hover:underline disabled:opacity-50"
          >
            {allChecked ? '전체 해제' : '전체 선택'}
          </button>
        )}
      </div>
      <ul className="max-h-56 space-y-0.5 overflow-y-auto rounded border border-border/50 bg-background/40 p-1">
        {fixes.map((f, i) => {
          const isChecked = checked.has(i);
          const typeLabel = (f.fix_type && FIX_TYPE_LABEL[f.fix_type]) || '맞춤법';
          return (
            <li
              key={i}
              className={`flex items-start gap-1.5 rounded px-1.5 py-1 text-[11px] ${
                status === 'pending' && isChecked ? 'bg-primary/5' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => toggle(i)}
                disabled={busy || status !== 'pending'}
                className="mt-0.5 h-3 w-3 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed"
                aria-label={`L${f.line} ${f.original} → ${f.suggestion}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                  <span className="rounded bg-blue-500/15 px-1 font-medium text-blue-600">{typeLabel}</span>
                  <span className="tabular-nums">L{f.line}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <span className="rounded bg-red-500/10 px-1 font-mono text-red-700 line-through">
                    {f.original}
                  </span>
                  <span className="text-muted-foreground">→</span>
                  <span className="rounded bg-emerald-500/10 px-1 font-mono text-emerald-700">
                    {f.suggestion}
                  </span>
                </div>
                {f.reason && (
                  <div className="mt-0.5 text-[10px] text-muted-foreground">{f.reason}</div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {/* 외부 footer 가 액션 제공 시 (ReviewOverlay) 내부 버튼 숨김 — UI 통일성. */}
      {!hideActions && status === 'pending' && (
        <div className="flex justify-end gap-1 pt-0.5">
          <button
            type="button"
            onClick={onReject}
            disabled={busy}
            className="rounded border border-border px-2 py-0.5 text-[10px] hover:bg-accent disabled:opacity-50"
            title="이 묶음 전체 무시"
          >
            전체 무시
          </button>
          <button
            type="button"
            onClick={() => onApply(Array.from(checked).sort((a, b) => a - b))}
            disabled={busy || noneChecked}
            className="rounded bg-primary px-2 py-0.5 text-[10px] text-primary-foreground disabled:opacity-50"
            title="체크된 항목만 본문에 일괄 자동 치환"
          >
            ✓ 선택 항목 적용 ({checked.size})
          </button>
        </div>
      )}
    </div>
  );
}

// ─────── 맞춤법 자동 치환 카드 ───────

interface SpellingFixPayload {
  episode_id?: string;
  line?: number;
  original?: string;
  suggestion?: string;
  fix_type?: 'typo' | 'spacing' | 'punctuation';
  reason?: string | null;
}

const FIX_TYPE_LABEL: Record<string, string> = {
  typo: '오탈자',
  spacing: '띄어쓰기',
  punctuation: '문장부호',
};

function SpellingFixCard({ payload }: { payload: Record<string, unknown> }) {
  const p = payload as SpellingFixPayload;
  const typeLabel = (p.fix_type && FIX_TYPE_LABEL[p.fix_type]) || '맞춤법';
  const lineLabel = p.line ? `L${p.line}` : '';
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
          {typeLabel}
        </span>
        <span className="text-[10px] text-muted-foreground">{lineLabel}</span>
      </div>
      {/* original → suggestion 한눈 비교 */}
      <div className="grid grid-cols-[auto,1fr] gap-x-2 gap-y-1 text-[11px]">
        <span className="text-muted-foreground">원본</span>
        <span className="rounded bg-red-500/10 px-1.5 py-0.5 font-mono text-red-700 line-through">
          {p.original}
        </span>
        <span className="text-muted-foreground">교정</span>
        <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-emerald-700">
          {p.suggestion}
        </span>
      </div>
      {p.reason && (
        <div className="text-[10px] text-muted-foreground">사유: {p.reason}</div>
      )}
    </div>
  );
}
