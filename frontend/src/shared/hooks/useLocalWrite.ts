import { usePowerSync } from '@powersync/react';
import { useWriterId } from './useWriterId';

/**
 * SQLite 직접 쓰기 유틸 훅.
 *
 * 클라이언트 UUID 전략:
 *   - 콘텐츠 PK(work.id, world_note.id 등)는 프론트엔드가 crypto.randomUUID()로 생성
 *   - db.execute() → SQLite 저장 + PowerSync CRUD 큐 누적
 *   - 로그인 후 uploadData()가 자동으로 큐를 백엔드로 전송
 */
export function useLocalWrite() {
  const db = usePowerSync();
  const writerId = useWriterId();

  return {
    createWork: async (title: string): Promise<string> => {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await db.execute(
        `INSERT INTO work (id, writer_id, title, status, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, 'active', 0, ?, ?)`,
        [id, writerId, title, now, now],
      );
      return id;
    },

    createWorldNote: async (workId: string, name: string, sortOrder: number): Promise<string> => {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await db.execute(
        `INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, NULL, ?, NULL, ?, ?, ?)`,
        [id, workId, writerId, name, sortOrder, now, now],
      );
      return id;
    },

    updateWorldNoteContent: async (id: string, content: string): Promise<void> => {
      const now = new Date().toISOString();
      await db.execute(
        `UPDATE world_note SET content = ?, updated_at = ? WHERE id = ?`,
        [content, now, id],
      );
    },

    updateWorldNoteName: async (id: string, name: string): Promise<void> => {
      const now = new Date().toISOString();
      await db.execute(
        `UPDATE world_note SET name = ?, updated_at = ? WHERE id = ?`,
        [name, now, id],
      );
    },
  };
}
