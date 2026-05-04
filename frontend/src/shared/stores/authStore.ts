import { create } from 'zustand';
import type { LoginEncryptionMaterial, Writer } from '../types/auth';
import { db } from '../sync/db';
import { useNetworkStore } from '../hooks/useNetworkStatus';
import {
  clearKek,
  getCurrentKek,
  initKekFromLogin,
  restoreKek,
} from '../crypto/lifecycle';
import { runBackfillForWriter } from '../crypto/backfill';
import { analytics } from '../lib/analytics';

/** 웹 모드에서는 게스트 모드 비활성 — getGuestId 호출이 throw하므로 분기 가드 필요. */
function isWebPlatform(): boolean {
  return typeof window !== 'undefined' && window.folio?.platform === 'web';
}

/**
 * 로그인 응답의 EncryptionMaterial로 KEK를 메모리에 도출.
 * Pepper Provider가 비활성(dev/test)인 백엔드 환경에서는 encryption이 null/undefined로
 * 내려오므로 KEK 도출을 건너뛴다(=암호화 동작 disable).
 */
async function deriveKekFromLogin(
  encryption: LoginEncryptionMaterial | null | undefined,
): Promise<void> {
  if (!encryption) return;
  try {
    await initKekFromLogin({
      sub: encryption.sub,
      saltBase64: encryption.salt,
      pepperUserBase64: encryption.pepperUser,
      pepperVersion: encryption.pepperVersion,
    });
  } catch (e) {
    // KEK 도출 실패는 로그인 자체를 막지 않는다 — 암호화/복호화가 필요한 시점에 사용자에게 노출.
    console.warn('[auth] KEK 도출 실패:', e);
  }
}

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
  'plan_note',
  'world_note',
  'character',
  'character_note',
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
  /**
   * 로컬 퍼스트 원칙: 로그아웃/앱 재시작 후에도 마지막 로그인 사용자의 로컬 데이터를
   * 계속 표시하기 위한 writerId. 로그인 경험이 없으면 null.
   * - 로그인 성공 시 세팅 (Main이 파일에 영속 저장)
   * - 로그아웃 시 유지 (★ 클리어 금지 — useQuery 필터가 바뀌면 데이터가 "사라져" 보임)
   * - 다른 사용자가 로그인하면 덮어씀
   */
  lastKnownWriterId: string | null;
  isAuthenticated: boolean;
  isGuest: boolean;
  isRestoring: boolean;
  isLoggingIn: boolean;
  error: string | null;

  /** 마지막 로그인이 신규 가입이었는지 (다이얼로그 분기용) */
  isNewUser: boolean;
  /** PowerSync connect 게이팅 — null이면 connect 금지 */
  syncDecision: SyncDecision;
  /**
   * Plan C 결정 22 — KEK 도출/회전/폐기 시 증가하는 카운터.
   * useBackfillEncryption 훅의 useEffect deps로 사용되어, login() 동기 백필 후 잔존
   * 평문이 있다면 fallback 백필 실행. KEK은 모듈 스코프 변수라 React가 직접 추적 못 하므로
   * 이 카운터를 통해 KEK 라이프사이클 변화를 컴포넌트 레이어로 전파한다.
   */
  kekVersion: number;

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
  /**
   * Main 프로세스의 token refresh가 RT 거부/재시도 초과로 실패한 경우 수신.
   * 앱 루트에서 1회 호출하고 반환된 함수로 언마운트 시 해지한다.
   */
  subscribeSessionEvents: () => () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  writer: null,
  guestWriterId: null,
  previousGuestId: null,
  lastKnownWriterId: null,
  isAuthenticated: false,
  isGuest: false,
  isRestoring: true,
  isLoggingIn: false,
  error: null,
  isNewUser: false,
  syncDecision: null,
  kekVersion: 0,

  /**
   * useQuery 필터에 사용할 writerId.
   * 우선순위: 현재 로그인 > 마지막 로그인(로컬 데이터 표시용) > 게스트
   * 로그아웃 직후에도 같은 값을 반환하도록 lastKnownWriterId를 중간에 끼운다.
   */
  currentWriterId: () => {
    const { writer, lastKnownWriterId, guestWriterId } = get();
    return writer?.id ?? lastKnownWriterId ?? guestWriterId;
  },

  restore: async () => {
    set({ isRestoring: true, error: null });
    try {
      const result = await window.folio.auth.tryRestore();
      if (result) {
        // 자동 복원: 이미 결정 끝난 기존 사용자 → 서버 우선으로 즉시 결정 확정.
        // use-server는 로컬이 비어 있을 때만 clear이고, restore 경로에선
        // App.tsx가 syncDecision만 보고 connect하므로 disconnectAndClear는 호출되지 않는다.
        //
        // KEK 복원: 백엔드 /auth/me는 EncryptionMaterial을 내려주지 않으므로,
        // 이전 로그인에서 영속 저장된 재료(safeStorage / IndexedDB)에서 재도출한다.
        // 영속 재료가 없거나(앱 첫 설치 후 자동 로그인 불가) pepper 회전 등으로
        // 재도출 실패하면 KEK는 null로 남고 사용자는 다음 명시 로그인에서 새로 받아야 한다.
        try {
          await restoreKek();
        } catch (e) {
          console.warn('[auth] restoreKek 실패:', e);
        }
        set((s) => ({
          writer: result.writer,
          guestWriterId: null,
          previousGuestId: null,
          lastKnownWriterId: result.writer.id,
          isAuthenticated: true,
          isGuest: false,
          isRestoring: false,
          isNewUser: false,
          syncDecision: 'use-server',
          // Plan C 결정 22: restoreKek 결과를 컴포넌트 레이어로 전파.
          // 잔존 평문이 있다면 useBackfillEncryption 훅이 자동 재시도.
          kekVersion: s.kekVersion + 1,
        }));
        return;
      }
    } catch {
      /* 네트워크 오류 등 — 아래에서 비인증 폴백 */
    }
    if (isWebPlatform()) {
      // 웹은 게스트 모드 없음 — 비인증 상태로 두고 로그인 화면 표시 (AppRoot가 처리).
      set({
        writer: null,
        guestWriterId: null,
        previousGuestId: null,
        lastKnownWriterId: null,
        isAuthenticated: false,
        isGuest: false,
        isRestoring: false,
        isNewUser: false,
        syncDecision: null,
      });
      return;
    }
    await get().enterGuestMode();
  },

  enterGuestMode: async () => {
    if (isWebPlatform()) {
      // 웹은 게스트 모드 자체가 없음 — 비인증 상태로만 전환.
      set({
        writer: null,
        guestWriterId: null,
        previousGuestId: null,
        lastKnownWriterId: null,
        isAuthenticated: false,
        isGuest: false,
        isRestoring: false,
        isNewUser: false,
        syncDecision: null,
      });
      return;
    }
    const [guestWriterId, lastKnownWriterId] = await Promise.all([
      window.folio.auth.getGuestId(),
      window.folio.auth.getLastKnownWriterId(),
    ]);
    // 로그인 경험이 있으면 lastKnownWriterId로 이전 데이터 계속 표시 (로컬 퍼스트).
    // 없으면 게스트 UUID 사용.
    set({
      writer: null,
      guestWriterId,
      previousGuestId: null,
      lastKnownWriterId,
      isAuthenticated: false,
      isGuest: true,
      isRestoring: false,
      isNewUser: false,
      syncDecision: null,
    });
  },

  /**
   * Google 로그인 — OAuth 완료 후 React state 를 갱신한다.
   *
   * 신규 가입자(isNewUser=true): 로컬 게스트 데이터를 안전하게 사용자 소유로 재매핑하는 것이
   * 확정 결정이므로, **writer 상태 변경 이전에 UPDATE writer_id 를 먼저 실행**한다.
   * 이렇게 해야 useQuery 의 첫 재필터링(writer_id = new user.id) 시점에 이미 로컬 행이
   * 매핑되어 있어 UI 가 깜빡이지 않는다 (login → useSyncResolver 사이 렌더 틈 제거).
   *
   * 기존 회원(isNewUser=false): 로컬 게스트 데이터와 서버 데이터가 충돌할 수 있으므로
   * 기존대로 syncDecision=null 로 남겨두고 useSyncResolver + 다이얼로그가 결정한다.
   */
  login: async () => {
    if (!useNetworkStore.getState().isOnline) {
      set({ error: '오프라인 상태에서는 로그인할 수 없습니다.' });
      return;
    }
    const currentGuestId = get().guestWriterId;
    set({ isLoggingIn: true, error: null });
    void analytics.track('login_started', { provider: 'google' });
    try {
      const result = await window.folio.auth.loginWithGoogle();

      // KEK 도출: pepper_user/salt/sub/version 영속 + 메모리 KEK 즉시 사용 가능 상태로.
      // 사용자 전환(initKekFromLogin 내부에서 sub 비교)도 자동 처리된다.
      await deriveKekFromLogin(result.encryption);

      // 신규 가입자 + 게스트 UUID 있으면 pre-state 재매핑으로 UI 깜빡임 제거
      const shouldPreRemap =
        result.isNewUser &&
        !!currentGuestId &&
        result.writer.id !== currentGuestId;

      if (shouldPreRemap && currentGuestId) {
        try {
          await db.writeTransaction(async (tx) => {
            for (const table of WRITER_ID_TABLES) {
              await tx.execute(
                `UPDATE ${table} SET writer_id = ? WHERE writer_id = ?`,
                [result.writer.id, currentGuestId],
              );
            }
          });
          console.log(
            `[sync] login-time remap: ${currentGuestId} → ${result.writer.id}`,
          );

          // Plan C 결정 22 — PowerSync connect 게이트(syncDecision)를 풀기 전에
          // 평문→ciphertext 동기 백필. AppRoot의 connect useEffect는 이 시점 이후에
          // syncDecision='use-local' set을 보고 발화하므로, race 없이 ciphertext만 업로드된다.
          // 백필 자체는 멱등(NOT LIKE 'v1:%' 필터) + ensureWorkKey 동시성 보호.
          const kek = getCurrentKek();
          if (kek) {
            try {
              await runBackfillForWriter({
                db,
                kek,
                writerId: result.writer.id,
              });
            } catch (e) {
              // 백필 실패는 로그인 자체를 막지 않음 — useBackfillEncryption 훅이 재시도.
              console.warn('[auth] login-time backfill 실패 — 훅이 재시도함:', e);
            }
          } else {
            // encryption=null 응답(백엔드 PepperProvider 비활성) 또는 KEK 도출 실패 케이스.
            // 평문 그대로 저장되며, 추후 PepperProvider 활성화 + 재로그인 시 백필 자동 동작.
            console.warn(
              '[auth] KEK 미도출 상태 — 백필 스킵. 백엔드 encryption 응답 확인 필요',
            );
          }
        } catch (e) {
          console.warn('[AuthStore] login-time remap 실패:', e);
        }
      }

      set((s) => ({
        writer: result.writer,
        guestWriterId: null,
        // 신규 가입자는 위에서 이미 재매핑 완료 → previousGuestId 보관 불필요
        // 기존 회원은 useSyncResolver 의 countRowsByWriter 참조용으로 유지
        previousGuestId: shouldPreRemap ? null : currentGuestId,
        isAuthenticated: true,
        isGuest: false,
        isLoggingIn: false,
        isNewUser: result.isNewUser,
        // 신규 가입자: 재매핑 끝났으므로 즉시 connect 허용 (use-local 확정)
        // 기존 회원: 다이얼로그 결정 대기
        syncDecision: shouldPreRemap ? 'use-local' : null,
        // 신규 가입자: lastKnownWriterId 즉시 커밋 (로그아웃 후에도 로컬 데이터 유지)
        lastKnownWriterId: shouldPreRemap
          ? result.writer.id
          : get().lastKnownWriterId,
        // Plan C 결정 22: deriveKekFromLogin 결과를 컴포넌트 레이어로 전파.
        // useBackfillEncryption 훅이 잔존 평문 fallback 처리.
        kekVersion: s.kekVersion + 1,
      }));

      // 신규 가입자 lastKnownWriterId 파일 영속
      if (shouldPreRemap) {
        try {
          await window.folio.auth.commitLastKnownWriterId(result.writer.id);
        } catch (e) {
          console.warn('[AuthStore] commitLastKnownWriterId 실패:', e);
        }
      }
      void analytics.track('login_succeeded', {
        provider: 'google',
        is_new_user: result.isNewUser,
      });
    } catch (e) {
      set({ isLoggingIn: false, error: (e as Error).message });
      void analytics.track('login_failed', {
        reason_code: 'oauth_error',
      });
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

        // Plan C 결정 22 — 기존 회원이 게스트 데이터 보존(use-local) 선택 시에도
        // syncDecision set 전에 평문→ciphertext 동기 백필. login() 분기와 동일 정책.
        const kek = getCurrentKek();
        if (kek) {
          try {
            await runBackfillForWriter({ db, kek, writerId: writer.id });
          } catch (e) {
            console.warn(
              '[auth] resolveSyncDecision-time backfill 실패 — 훅이 재시도함:',
              e,
            );
          }
        }
      } catch (e) {
        console.warn('[AuthStore] writer_id 재매핑 실패:', e);
      }
    }
    // 결정 후 previousGuestId 정리 + lastKnownWriterId 커밋(로그아웃 후에도 로컬 데이터 유지).
    set({
      syncDecision: decision,
      previousGuestId: null,
      lastKnownWriterId: writer?.id ?? get().lastKnownWriterId,
    });
    if (writer) {
      try {
        await window.folio.auth.commitLastKnownWriterId(writer.id);
      } catch (e) {
        console.warn('[AuthStore] commitLastKnownWriterId 실패:', e);
      }
    }
  },

  logout: async () => {
    try {
      await window.folio.auth.logout();
    } finally {
      // KEK + work key 캐시 + 영속 재료까지 모두 폐기. 네트워크 오류로 logout이 실패해도
      // 메모리/디스크 비우기는 진행해야 다음 사용자 세션에 KEK 잔류를 막는다.
      try {
        await clearKek();
      } catch (e) {
        console.warn('[auth] clearKek 실패:', e);
      }
      if (isWebPlatform()) {
        // 웹은 로그아웃 시 게스트로 떨어지지 않음 — 비인증 상태로만 전환.
        // AppRoot가 비인증 상태를 감지해 로그인 안내(또는 랜딩 redirect) 화면을 표시.
        set((s) => ({
          writer: null,
          guestWriterId: null,
          previousGuestId: null,
          lastKnownWriterId: null,
          isAuthenticated: false,
          isGuest: false,
          isNewUser: false,
          syncDecision: null,
          // Plan C 결정 22: clearKek 결과 전파. 다음 사용자 로그인 시 fresh state 보장.
          kekVersion: s.kekVersion + 1,
        }));
        return;
      }
      const guestWriterId = get().guestWriterId ?? (await window.folio.auth.getGuestId());
      // 로컬 퍼스트: lastKnownWriterId는 유지한다. useQuery 필터가 그대로라
      // 글 목록 등이 "사라진 것처럼" 보이는 현상을 막는다.
      set((s) => ({
        writer: null,
        guestWriterId,
        previousGuestId: null,
        isAuthenticated: false,
        isGuest: true,
        isNewUser: false,
        syncDecision: null,
        // Plan C 결정 22: clearKek 결과 전파.
        kekVersion: s.kekVersion + 1,
      }));
    }
  },

  subscribeSessionEvents: () =>
    window.folio.auth.onSessionExpired(() => {
      // Main에서 이미 로컬 토큰을 정리한 상태. 클라이언트 상태도 게스트 모드로 전환.
      console.warn('[auth] 세션 만료 감지 — 게스트 모드로 전환');
      void get().logout();
    }),
}));
