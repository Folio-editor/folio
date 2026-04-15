// ============================================================
// 게스트 → 실제 계정 전환 시 SQLite 정리
// ============================================================
// 클라이언트 UUID 전략: 프론트엔드가 콘텐츠 PK(work.id, world_note.id 등)를
// crypto.randomUUID()로 생성하므로 ID 재매핑이 불필요하다.
//
// 흐름:
//   1) 게스트 쓰기 → SQLite + PowerSync CRUD 큐 누적
//   2) 로그인 → PowerSync가 uploadData() 자동 호출 → 백엔드로 전송
//      (백엔드: client UUID 그대로 저장, JWT에서 writer_id 덮어쓰기)
//   3) 이 함수: SQLite에 남은 guestUUID 행 정리 (중복 방지)
//
// 실행 시점: authStore.login() 완료 직후 (백그라운드)
// ============================================================

import { db } from '../../renderer/sync/db';

/**
 * 로그인 후 SQLite에 남은 guestUUID 기반 행을 삭제한다.
 * CRUD 큐 업로드는 PowerSync의 uploadData()가 자동 처리하므로
 * 여기서는 SQLite 정리만 담당한다.
 */
export async function cleanupGuestData(guestWriterId: string): Promise<void> {
  await db.writeTransaction(async (tx) => {
    // FK 의존성 순서로 자식 테이블부터 삭제
    await tx.execute('DELETE FROM world_note WHERE writer_id = ?', [guestWriterId]);
    await tx.execute('DELETE FROM work WHERE writer_id = ?', [guestWriterId]);
    // 향후 추가: character, episode, plot, foreshadow, idea_archive 등
    // (각 기능 구현 시 여기에 추가한다)
  });
}
