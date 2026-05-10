/**
 * Agent 제안 받은 편지함 (extraction_suggestion).
 *
 * pending 목록 + 승인/거절 버튼.
 * 승인 시 backend 가 status='confirmed' 표기. 실제 character/world_note 등록은
 * Phase 5 자동 INSERT 또는 작가가 payload 보고 수동 작성.
 */

import { useEffect, useState } from 'react';
import { Check, X, Loader2 } from 'lucide-react';

import {
  listSuggestions,
  patchSuggestion,
  type AgentSuggestion,
} from '../../api/agent';
import { useAuthStore } from '../../stores/authStore';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';

const ENTITY_LABEL: Record<string, string> = {
  character: '인물 추가',
  character_update: '인물 수정',
  character_delete: '인물 삭제',
  world_note: '세계관 추가',
  world_note_update: '세계관 수정',
  world_note_delete: '세계관 삭제',
  term: '용어',
  plot_create: '플롯 추가',
  plot_tree: '챕터 + 하위 플롯',
  plot_revision: '플롯 수정',
  plot_delete: '플롯 삭제',
  episode_draft: '회차 초안',
  episode_update: '회차 수정',
  episode_delete: '회차 삭제',
};

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
          ? '오프라인 상태에서는 받은편지함을 조회할 수 없습니다.'
          : isGuest
            ? '게스트 모드에서는 사용할 수 없습니다. 로그인 후 이용해주세요.'
            : '로그인이 필요합니다.'}
      </div>
    );
  }

  async function handlePatch(id: string, status: 'confirmed' | 'rejected') {
    setBusyId(id);
    try {
      await patchSuggestion(id, status);
      await refresh();
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
          <div className="text-center text-xs text-muted-foreground">제안이 없습니다.</div>
        )}
        {items.map((item) => (
          <SuggestionCard
            key={item.id}
            item={item}
            busy={busyId === item.id}
            onConfirm={() => handlePatch(item.id, 'confirmed')}
            onReject={() => handlePatch(item.id, 'rejected')}
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
}: {
  item: AgentSuggestion;
  busy: boolean;
  onConfirm: () => void;
  onReject: () => void;
}) {
  const label = ENTITY_LABEL[item.entity_type] ?? item.entity_type;
  return (
    <div className="rounded border border-border bg-background p-2 text-xs">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{label}</span>
        <span className="text-[10px] text-muted-foreground">
          {new Date(item.created_at).toLocaleString()}
        </span>
      </div>
      <div className="font-medium">{item.suggested_name}</div>
      <p className="mt-1 text-[10px] text-muted-foreground">
        ※ 내용 미리보기는 채팅창의 agent 응답에서 확인하세요.
      </p>
      {item.status === 'pending' && (
        <div className="mt-2 flex justify-end gap-1">
          <button
            type="button"
            onClick={onReject}
            disabled={busy}
            className="flex h-7 items-center gap-1 rounded border border-border px-2 text-xs hover:bg-accent disabled:opacity-50"
          >
            <X size={12} /> 거절
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex h-7 items-center gap-1 rounded bg-primary px-2 text-xs text-primary-foreground disabled:opacity-50"
          >
            <Check size={12} /> 승인 (자동 작성)
          </button>
        </div>
      )}
      {item.status !== 'pending' && (
        <div className="mt-1 text-[10px] text-muted-foreground">
          상태: {item.status === 'confirmed' ? '✓ 승인 (자동 작성됨)' : '거절'}
          {item.reviewer_note && <> · {item.reviewer_note}</>}
        </div>
      )}
    </div>
  );
}
