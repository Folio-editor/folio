/**
 * Agent 작업물 (extraction_suggestion).
 *
 * pending / confirmed / rejected 필터 + 카드별 본문 미리보기 (펼치기) + 승인/거절.
 * 승인 시 backend SuggestionApplier 가 character/world_note/episode 등 실제 테이블에 INSERT/UPDATE.
 *
 * 로컬 히스토리 기능 — confirmed/rejected 까지 같은 화면에서 조회 가능.
 */

import { useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Loader2, Trash2, X } from 'lucide-react';

import {
  deleteSuggestion,
  listSuggestions,
  patchSuggestion,
  type AgentSuggestion,
} from '../../api/agent';
import { useAuthStore } from '../../stores/authStore';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { SuggestionBodyPreview, entityLabel, useDecryptedSuggestion } from './suggestionPreview';

export function SuggestionInbox() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isGuest = useAuthStore((s) => s.isGuest);
  const isOnline = useNetworkStatus();
  const eligible = isAuthenticated && !isGuest && isOnline;

  const [items, setItems] = useState<AgentSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'confirmed' | 'rejected' | 'all'>('pending');

  async function refresh() {
    if (!eligible) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const status = filter === 'all' ? undefined : filter;
      const rows = await listSuggestions(status);
      setItems(rows);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [filter, eligible]);

  if (!eligible) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-xs text-muted-foreground">
        {!isOnline
          ? '오프라인 상태에서는 작업물을 조회할 수 없습니다.'
          : isGuest
            ? '게스트 모드에서는 사용할 수 없습니다. 로그인 후 이용해주세요.'
            : '로그인이 필요합니다.'}
      </div>
    );
  }

  async function handlePatch(
    id: string,
    status: 'confirmed' | 'rejected',
    selectedIndices?: number[],
  ) {
    setBusyId(id);
    try {
      await patchSuggestion(id, status, undefined, selectedIndices);
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    try {
      await deleteSuggestion(id);
      // 낙관적 제거 — refresh 보다 빠른 UX
      setItems((prev) => prev.filter((s) => s.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 gap-1 border-b border-border/60 p-2">
        {(['pending', 'confirmed', 'rejected', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded px-2 py-1 text-xs ${
              filter === f
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent'
            }`}
          >
            {f === 'pending' ? '대기' : f === 'confirmed' ? '승인됨' : f === 'rejected' ? '거절' : '전체'}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
        {loading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> 불러오는 중...
          </div>
        )}
        {!loading && items.length === 0 && (
          <div className="text-center text-xs text-muted-foreground">작업물이 없습니다.</div>
        )}
        {items.map((item) => (
          <SuggestionCard
            key={item.id}
            item={item}
            busy={busyId === item.id}
            onConfirm={(selectedIndices) => handlePatch(item.id, 'confirmed', selectedIndices)}
            onReject={() => handlePatch(item.id, 'rejected')}
            onDelete={() => handleDelete(item.id)}
          />
        ))}
      </div>
    </div>
  );
}

function SuggestionCard({
  item,
  busy,
  onConfirm,
  onReject,
  onDelete,
}: {
  item: AgentSuggestion;
  busy: boolean;
  /** spelling_batch 일 때 selectedIndices 전달, 그 외는 인자 없음. */
  onConfirm: (selectedIndices?: number[]) => void;
  onReject: () => void;
  onDelete: () => void;
}) {
  // pending 은 자동 펼침 (작가가 즉시 검토하도록), confirmed/rejected 는 접힘 시작 (히스토리 조회 모드)
  const [previewOpen, setPreviewOpen] = useState(item.status === 'pending');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const label = entityLabel(item.entity_type);
  // review_issue 는 자동 적용 X — 작가가 본문을 직접 수정한 뒤 '확인/무시' 로 큐에서 닫는 체크리스트형.
  // spelling_fix 는 1:1 자동 치환 — '적용 / 무시'.
  // 다른 entity_type 은 승인 시 SuggestionApplier 가 INSERT/UPDATE/DELETE 자동 실행 ('승인 (자동 작성) / 거절').
  const isReviewIssue = item.entity_type === 'review_issue';
  const isSpellingFix = item.entity_type === 'spelling_fix';
  // suggested_name + reviewer_note 가 v1: ciphertext 일 수 있음 (2026-05-09 암호화 정책) — 자동 복호화.
  const decoded = useDecryptedSuggestion(item);
  return (
    <div className="rounded border border-border bg-background p-2 text-xs">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{label}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">
            {new Date(item.created_at).toLocaleString()}
          </span>
          {/* 영구 삭제 — 처리 완료/미처리 모두 가능. 승인된 entity 본문은 보존, 큐 행만 제거. */}
          {confirmingDelete ? (
            <span className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={busy}
                className="rounded border border-border px-1.5 py-0.5 text-[10px] hover:bg-accent disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmingDelete(false);
                  onDelete();
                }}
                disabled={busy}
                className="rounded bg-red-500 px-1.5 py-0.5 text-[10px] text-white hover:bg-red-600 disabled:opacity-50"
              >
                삭제
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              disabled={busy}
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50"
              title="이 기록 영구 삭제"
              aria-label="기록 삭제"
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setPreviewOpen((v) => !v)}
        className="mb-1 flex w-full items-center gap-1.5 rounded text-left hover:bg-accent/40"
        title={previewOpen ? '미리보기 접기' : '미리보기 펼치기'}
      >
        {previewOpen ? (
          <ChevronDown size={12} className="shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight size={12} className="shrink-0 text-muted-foreground" />
        )}
        <span className="flex-1 truncate font-medium">{decoded.suggested_name}</span>
      </button>
      {previewOpen && (
        <div className="mt-1 border-t border-border/40 pt-2">
          <SuggestionBodyPreview
            s={item}
            workId={item.work_id}
            busy={busy}
            onApprove={onConfirm}
            onReject={onReject}
          />
        </div>
      )}
      {!previewOpen && item.status === 'pending' && (
        <div className="mt-2 flex justify-end gap-1">
          <button
            type="button"
            onClick={onReject}
            disabled={busy}
            className="flex h-7 items-center gap-1 rounded border border-border px-2 text-xs hover:bg-accent disabled:opacity-50"
            title={
              isReviewIssue
                ? '이 발견을 무시'
                : isSpellingFix
                  ? '이 수정을 무시'
                  : '이 제안을 거절'
            }
          >
            <X size={12} /> {isReviewIssue || isSpellingFix ? '무시' : '거절'}
          </button>
          <button
            type="button"
            onClick={() => onConfirm()}
            disabled={busy}
            className={
              isReviewIssue
                ? 'flex h-7 items-center gap-1 rounded border border-border px-2 text-xs hover:bg-accent disabled:opacity-50'
                : 'flex h-7 items-center gap-1 rounded bg-primary px-2 text-xs text-primary-foreground disabled:opacity-50'
            }
            title={
              isReviewIssue
                ? '확인 처리 (본문 자동 수정 안 함 — 작가가 직접 수정)'
                : isSpellingFix
                  ? '승인 시 본문에 즉시 자동 치환 (PowerSync sync)'
                  : '승인 시 본문에 자동 작성됩니다'
            }
          >
            <Check size={12} />{' '}
            {isReviewIssue ? '확인' : isSpellingFix ? '적용' : '승인 (자동 작성)'}
          </button>
        </div>
      )}
      {!previewOpen && item.status !== 'pending' && (
        <div className="mt-1 text-[10px] text-muted-foreground">
          상태:{' '}
          {item.status === 'confirmed'
            ? isReviewIssue
              ? '✓ 확인됨'
              : isSpellingFix
                ? '✓ 적용됨'
                : '✓ 승인 (자동 작성됨)'
            : isReviewIssue || isSpellingFix
              ? '무시'
              : '거절'}
          {decoded.reviewer_note && <> · {decoded.reviewer_note}</>}
        </div>
      )}
    </div>
  );
}
