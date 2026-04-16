import { useAuthStore } from '../stores/authStore';

/**
 * 현재 세션의 writerId를 반환한다.
 * - 로그인 상태: 실제 writer UUID
 * - 게스트 상태: guest UUID (userData/guest-id.txt)
 *
 * 에디터 기능에서 데이터 생성·조회 시 이 훅으로 writer_id를 가져온다.
 *
 * @example
 * const writerId = useWriterId();
 * const { data: works } = useQuery(
 *   'SELECT * FROM work WHERE writer_id = ? ORDER BY sort_order',
 *   [writerId],
 * );
 */
export function useWriterId(): string {
  const writerId = useAuthStore((s) => s.currentWriterId());
  if (!writerId) {
    // restore가 완료되기 전 호출되면 빈 문자열 반환 (useQuery에서 빈 결과 반환)
    return '';
  }
  return writerId;
}

/**
 * 현재 게스트 모드인지 여부.
 * 클라우드 전용 기능(공유, 내보내기 등) 비활성화 시 사용한다.
 */
export function useIsGuest(): boolean {
  return useAuthStore((s) => s.isGuest);
}
