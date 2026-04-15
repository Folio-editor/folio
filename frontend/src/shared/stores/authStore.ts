import { create } from 'zustand';
import type { Writer } from '../types/auth';
import { db } from '../../renderer/sync/db';

// ────────────────────────────────────────────────────────────
// 앱 모드
//   restoring     — 앱 시작 시 이전 세션 복원 중 (로딩 스피너)
//   guest         — 로그인 없이 로컬 SQLite만 사용
//   authenticated — Google 로그인 완료. PowerSync sync는 syncDecision이 결정된 후에만 활성
//
// syncDecision 게이팅 (offline-first 보호):
//   null         — 결정 대기. App.tsx는 connect()를 호출하지 않는다.
//   'use-server' — 로컬 폐기 후 서버 기준으로 시작 (disconnectAndClear → connect)
//   'use-local'  — 게스트 로컬 데이터를 서버로 백업 (그대로 connect, 신규 가입자에게만 권장)
//
// 신규/기존 판별:
//   isNewUser=true  → 서버 데이터 0건 확정. 로컬 백업해도 안전.
//   isNewUser=false → 기존 회원. 서버 데이터가 있을 가능성 → 서버 우선.
// ────────────────────────────────────────────────────────────

export type SyncDecision = 'use-server' | 'use-local' | null;

/**
 * PowerSync 동기화 대상 중 writer_id 컬럼을 가진 테이블들.
 * 로그인 시 게스트 UUID → 사용자 UUID 재매핑 대상이 된다.
 * (종속 테이블: character_custom_field, character_tag, plot_episode_link, foreshadow_link는
 *  writer_id가 없고 부모 id로 연결되므로 영향 없음)
 */
const WRITER_ID_TABLES = [
  'work',
  'plan',
  'world_note',
  'character',
  'plot',
  'episode',
  'foreshadow',
  'idea_archive',
] as const;

interface AuthState {
  writer: Writer | null;
  guestWriterId: string | null;
  /**
   * 로그인 직전의 게스트 UUID. 로그인 완료 후에도 useSyncResolver가
   * "이 guestId로 작성된 로컬 행이 몇 개인가"를 조회하기 위해 보관한다.
   * syncDecision이 결정되면 null로 정리한다.
   */
  previousGuestId: string | null;
  isAuthenticated: boolean;
  isGuest: boolean;
  isRestoring: boolean;
  isLoggingIn: boolean;
  error: string | null;

  /** 마지막 로그인이 신규 가입이었는지 (다이얼로그 분기용) */
  isNewUser: boolean;
  /** PowerSync connect 게이팅 — null이면 connect 금지 */
  syncDecision: SyncDecision;

  currentWriterId: () => string | null;

  restore: () => Promise<void>;
  enterGuestMode: () => Promise<void>;
  /** Google OAuth만 수행. PowerSync connect는 resolveSyncDecision으로 별도 게이팅 */
  login: () => Promise<void>;
  logout: () => Promise<void>;
  /**
   * 사용자(또는 자동 판별)의 sync 의사결정을 적용한다.
   * 'use-server'면 disconnectAndClear()로 로컬을 비운 뒤 connect 허용 상태로 전환.
   */
  resolveSyncDecision: (decision: 'use-server' | 'use-local') => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  writer: null,
  guestWriterId: null,
  previousGuestId: null,
  isAuthenticated: false,
  isGuest: false,
  isRestoring: true,
  isLoggingIn: false,
  error: null,
  isNewUser: false,
  syncDecision: null,

  currentWriterId: () => {
    const { writer, guestWriterId } = get();
    return writer?.id ?? guestWriterId;
  },

  restore: async () => {
    set({ isRestoring: true, error: null });
    try {
      const result = await window.storyzip.auth.tryRestore();
      if (result) {
        // 자동 복원: 이미 결정 끝난 기존 사용자 → 서버 우선으로 즉시 결정 확정
        set({
          writer: result.writer,
          guestWriterId: null,
          previousGuestId: null,
          isAuthenticated: true,
          isGuest: false,
          isRestoring: false,
          isNewUser: false,
          syncDecision: 'use-server',
        });
        return;
      }
    } catch {
      /* 네트워크 오류 등 — 게스트로 폴백 */
    }
    await get().enterGuestMode();
  },

  enterGuestMode: async () => {
    const guestWriterId = await window.storyzip.auth.getGuestId();
    set({
      writer: null,
      guestWriterId,
      previousGuestId: null,
      isAuthenticated: false,
      isGuest: true,
      isRestoring: false,
      isNewUser: false,
      syncDecision: null,
    });
  },

  /**
   * Google 로그인 — OAuth만 수행하고 connect는 시작하지 않는다.
   * isNewUser는 응답에서 보관, 이후 useSyncResolver가 로컬 데이터 카운트와 함께
   * resolveSyncDecision()을 호출해 connect를 허용한다.
   */
  login: async () => {
    const currentGuestId = get().guestWriterId;
    set({ isLoggingIn: true, error: null });
    try {
      const result = await window.storyzip.auth.loginWithGoogle();
      set({
        writer: result.writer,
        // 로그인 직전의 guestWriterId를 previousGuestId로 이동 — useSyncResolver가 조회에 사용
        guestWriterId: null,
        previousGuestId: currentGuestId,
        isAuthenticated: true,
        isGuest: false,
        isLoggingIn: false,
        isNewUser: result.isNewUser,
        syncDecision: null, // ← connect 금지 상태에서 시작
      });
    } catch (e) {
      set({ isLoggingIn: false, error: (e as Error).message });
    }
  },

  resolveSyncDecision: async (decision) => {
    const { writer, previousGuestId } = get();

    if (decision === 'use-server') {
      try {
        await db.disconnectAndClear();
      } catch (e) {
        console.warn('[AuthStore] disconnectAndClear 실패:', e);
      }
    } else if (decision === 'use-local' && writer && previousGuestId && writer.id !== previousGuestId) {
      // 게스트로 작성한 로컬 행들의 writer_id를 로그인 사용자 UUID로 일괄 재매핑.
      // - UI useQuery가 즉시 현재 writer로 필터되어 로컬 데이터가 바로 보임
      // - 이 UPDATE는 ps_crud에 PATCH 큐로 쌓이고, 업로드 시 백엔드가 writer_id를
      //   JWT 값(=writer.id, 동일)으로 덮어쓰므로 서버 저장 결과는 동일
      try {
        await db.writeTransaction(async (tx) => {
          for (const table of WRITER_ID_TABLES) {
            await tx.execute(
              `UPDATE ${table} SET writer_id = ? WHERE writer_id = ?`,
              [writer.id, previousGuestId],
            );
          }
        });
        console.log(`[sync] 로컬 writer_id 재매핑: ${previousGuestId} → ${writer.id}`);
      } catch (e) {
        console.warn('[AuthStore] writer_id 재매핑 실패:', e);
      }
    }
    // 결정 후 previousGuestId 정리
    set({ syncDecision: decision, previousGuestId: null });
  },

  logout: async () => {
    try {
      await window.storyzip.auth.logout();
    } finally {
      const guestWriterId = get().guestWriterId ?? (await window.storyzip.auth.getGuestId());
      set({
        writer: null,
        guestWriterId,
        previousGuestId: null,
        isAuthenticated: false,
        isGuest: true,
        isNewUser: false,
        syncDecision: null,
      });
    }
  },
}));
