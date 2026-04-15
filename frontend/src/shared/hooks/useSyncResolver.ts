import { useEffect, useRef, useState } from 'react';
import { usePowerSync } from '@powersync/react';
import { useAuthStore } from '../stores/authStore';

interface ResolverState {
  /** 다이얼로그 표시 여부 (기존 유저 + 로컬 데이터 있음 케이스에만) */
  showDialog: boolean;
  guestRowCount: number;
}

const SYNC_TABLES = [
  'work',
  'plan',
  'world_note',
  'character',
  'plot',
  'episode',
  'foreshadow',
  'idea_archive',
];

/**
 * 로그인 직후 sync 의사결정을 자동/수동으로 처리한다.
 *
 * 정책 — "로컬을 자연스럽게 유지하며 서버에 백업":
 *   1. 신규 가입자(isNewUser=true)
 *      → 로컬 데이터 유무 관계없이 자동 'use-local' (로컬 보존 + 자동 업로드)
 *   2. 기존 회원(isNewUser=false) + 로컬 데이터 0건
 *      → 자동 'use-server' (서버 데이터 sync down)
 *   3. 기존 회원 + 로컬 데이터 >0건
 *      → 다이얼로그 (서버 데이터 덮어쓸 위험이 있으므로 폐기 안내)
 *
 * 상위 컴포넌트는 showDialog=true일 때만 SyncDecisionDialog를 렌더한다.
 */
export function useSyncResolver(): ResolverState & {
  busy: boolean;
  resolveUseServer: () => Promise<void>;
  cancel: () => Promise<void>;
} {
  const db = usePowerSync();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const syncDecision = useAuthStore((s) => s.syncDecision);
  const previousGuestId = useAuthStore((s) => s.previousGuestId);
  const isNewUser = useAuthStore((s) => s.isNewUser);
  const resolveSyncDecision = useAuthStore((s) => s.resolveSyncDecision);
  const logout = useAuthStore((s) => s.logout);

  const [state, setState] = useState<ResolverState>({ showDialog: false, guestRowCount: 0 });
  const [busy, setBusy] = useState(false);
  const lastResolvedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const needResolve = isAuthenticated && syncDecision === null;

    if (!needResolve) {
      // 결정이 끝나면 다이얼로그 닫기
      if (state.showDialog) setState({ showDialog: false, guestRowCount: 0 });
      lastResolvedKeyRef.current = null;
      return;
    }
    // 같은 로그인 사이클에서 중복 트리거 방지
    const key = `${isNewUser}-${previousGuestId ?? 'null'}`;
    if (lastResolvedKeyRef.current === key) return;
    lastResolvedKeyRef.current = key;

    void (async () => {
      // 1) 신규 가입자 — 무조건 자동 백업 (로컬 보존)
      if (isNewUser) {
        await resolveSyncDecision('use-local');
        return;
      }

      // 2) 기존 회원 — 로컬 데이터 유무 판별
      const count = await countRows(db, previousGuestId);
      if (count === 0) {
        // 로컬 비어있음 → 바로 서버 우선 (sync down)
        await resolveSyncDecision('use-server');
        return;
      }
      // 로컬 데이터 있음 → 다이얼로그로 폐기 확인
      setState({ showDialog: true, guestRowCount: count });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, syncDecision, isNewUser, previousGuestId]);

  const wrap = (fn: () => Promise<void>) => async () => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return {
    showDialog: state.showDialog,
    guestRowCount: state.guestRowCount,
    busy,
    resolveUseServer: wrap(async () => {
      await resolveSyncDecision('use-server');
    }),
    cancel: wrap(async () => {
      setState({ showDialog: false, guestRowCount: 0 });
      await logout();
    }),
  };
}

/**
 * 주어진 writerId로 작성된 모든 동기화 테이블 행 수 합계 (단일 UNION ALL 쿼리).
 */
async function countRows(
  db: ReturnType<typeof usePowerSync>,
  writerId: string | null,
): Promise<number> {
  if (!writerId) return 0;
  const unionSql = SYNC_TABLES
    .map((t) => `SELECT COUNT(*) AS cnt FROM ${t} WHERE writer_id = ?`)
    .join(' UNION ALL ');
  const params = SYNC_TABLES.map(() => writerId);
  const result = await db.execute(`SELECT SUM(cnt) AS total FROM (${unionSql})`, params);
  const row = (result.rows?._array as { total: number | null }[] | undefined)?.[0];
  return row?.total ?? 0;
}
