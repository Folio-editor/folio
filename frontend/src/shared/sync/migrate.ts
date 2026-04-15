// ============================================================
// 게스트 → 실제 계정 데이터 마이그레이션
// ============================================================
// 로그인 성공 시 guestWriterId로 SQLite에 저장된 로컬 데이터를
// 백엔드 API로 업로드하고 실제 writerId로 교체한다.
//
// 실행 시점: authStore.login() 완료 직후 (백그라운드)
// 실패 시: 경고 로그만 남기고 무시 (로컬 데이터는 SQLite에 유지)
//
// 구현 순서:
//   1단계(현재): work 엔티티만 마이그레이션 (에디터 기능 미구현)
//   2단계: episode, character, plot, foreshadow 등 추가 (기능 구현 시)
// ============================================================

import { db } from '../../renderer/sync/db';
import { apiClient } from '../lib/apiClient';

interface LocalWork {
  id: string;
  title: string;
  author_name: string | null;
  description: string | null;
  status: string;
  sort_order: number;
}

/**
 * guestWriterId로 저장된 모든 work를 서버에 업로드하고
 * 로컬 SQLite에서 삭제한다.
 * PowerSync가 real writerId 기반으로 서버 데이터를 내려받아 대체한다.
 */
export async function migrateGuestToAccount(
  guestWriterId: string,
  _realWriterId: string,
): Promise<void> {
  // 게스트 work 조회
  const works = await db.getAll<LocalWork>(
    'SELECT id, title, author_name, description, status, sort_order FROM work WHERE writer_id = ?',
    [guestWriterId],
  );

  if (works.length === 0) return;

  for (const work of works) {
    try {
      // 서버에 work 생성 (백엔드가 real writerId를 JWT에서 추출)
      await apiClient.post('/works', {
        title: work.title,
        authorName: work.author_name,
        description: work.description,
        status: work.status,
        sortOrder: work.sort_order,
      });

      // TODO: 해당 work의 하위 엔티티도 업로드
      // episode, character, plan, world_note, plot, foreshadow, idea_archive
      // 각 기능 구현 시 여기에 추가한다.
    } catch (e) {
      console.warn(`[migrate] work(${work.id}) 업로드 실패:`, e);
    }
  }

  // 게스트 rows 삭제 (PowerSync가 real writerId 데이터로 대체)
  await db.writeTransaction(async (tx) => {
    await tx.execute('DELETE FROM work WHERE writer_id = ?', [guestWriterId]);
    // TODO: 하위 엔티티 삭제도 추가
  });
}
