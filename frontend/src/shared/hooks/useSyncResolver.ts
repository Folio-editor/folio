import { useEffect, useRef, useState } from 'react';
import { usePowerSync } from '@powersync/react';
import { useAuthStore } from '../stores/authStore';

interface ResolverState {
  /** 다이얼로그 표시 여부 (기존 유저 + 로컬 게스트 데이터 있음 케이스에만) */
  showDialog: boolean;
  guestRowCount: number;
}

const SYNC_TABLES = [
  'work',
  'plan',
  'plan_note',
  'world_note',
  'character',
  'character_note',
  'plot',
  'episode',
  'foreshadow',
  'idea_archive',
];

/**
 * 로그인 직후 sync 의사결정을 자동/수동으로 처리한다.
 *
 * 판정 매트릭스 — (userRows: 로그인 사용자 UUID 행 수, guestRows: 이전 게스트 UUID 행 수):
 *   - isNewUser=true
 *       → 'use-local' (게스트 UUID가 있으면 재매핑, 없으면 no-op)
 *   - userRows>0, guestRows=0
 *       → 'use-local' (★ 재로그인 / 같은 계정 자동복원. clear 금지!)
 *   - userRows=0, guestRows=0
 *       → 'use-server' (완전 빈 앱 — 서버에서 다운로드)
 *   - guestRows>0 (userRows 무관)
 *       → 다이얼로그 (사용자가 서버 사용/취소 선택)
 *
 * 주의: guestRows만 세고 '0이면 clear'로 단정하면 재로그인 시 로컬이 통째로 날아간다.
 * 재로그인에서는 로컬 행이 이전 로그인 사용자 UUID로 남아있기 때문.
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
  const writerId = useAuthStore((s) => s.writer?.id ?? null);
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
    const key = `${isNewUser}-${previousGuestId ?? 'null'}-${writerId ?? 'null'}`;
    if (lastResolvedKeyRef.current === key) return;
    lastResolvedKeyRef.current = key;

    void (async () => {
      // 1) 신규 가입자 — 무조건 로컬 보존 (게스트 UUID가 있으면 재매핑)
      if (isNewUser) {
        await resolveSyncDecision('use-local');
        return;
      }

      // 2) 로컬 상태 두 방향 모두 확인
      const [userRows, guestRows] = await Promise.all([
        countRowsByWriter(db, writerId),
        countRowsByWriter(db, previousGuestId),
      ]);

      // 2-a) 게스트 로컬 데이터가 있으면 서버 덮어쓸 위험 → 다이얼로그
      if (guestRows > 0) {
        setState({ showDialog: true, guestRowCount: guestRows });
        return;
      }

      // 2-b) 재로그인 / 자동 복원 — 로컬에 이미 내 데이터가 있음
      //      clear 없이 그대로 connect (use-local은 writer.id === writer.id이므로 UPDATE는 no-op)
      if (userRows > 0) {
        await resolveSyncDecision('use-local');
        return;
      }

      // 2-c) 완전 빈 상태 (새 기기 첫 로그인 등) — 서버에서 sync down
      await resolveSyncDecision('use-server');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, syncDecision, isNewUser, previousGuestId, writerId]);

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
async function countRowsByWriter(
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
