import { usePowerSync } from '@powersync/react';
import { useWriterId } from './useWriterId';

/**
 * SQLite 직접 쓰기 유틸 훅.
 *
 * 클라이언트 UUID 전략:
 *   - 콘텐츠 PK는 프론트엔드가 crypto.randomUUID()로 생성
 *   - db.execute() → SQLite 저장 + PowerSync CRUD 큐 누적
 *   - 로그인 후 uploadData()가 자동으로 큐를 백엔드로 전송
 *
 * 임시 구현 범위: parent_id는 NULL 고정 (트리는 추후 단계).
 */
export function useLocalWrite() {
  const db = usePowerSync();
  const writerId = useWriterId();

  return {
    // ── work ────────────────────────────────────────────────
    createWork: async (title: string): Promise<string> => {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await db.execute(
        `INSERT INTO work (id, writer_id, title, author_name, description, status, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, NULL, NULL, '연재중', 0, ?, ?)`,
        [id, writerId, title, now, now],
      );
      return id;
    },
    updateWork: async (
      id: string,
      patch: Partial<{
        title: string;
        author_name: string | null;
        description: string | null;
        status: string;
      }>,
    ): Promise<void> => {
      const now = new Date().toISOString();
      const fields = Object.keys(patch);
      if (fields.length === 0) return;
      const setClause = fields.map((f) => `${f} = ?`).join(', ');
      const values = fields.map((f) => patch[f as keyof typeof patch] ?? null);
      await db.execute(
        `UPDATE work SET ${setClause}, updated_at = ? WHERE id = ?`,
        [...values, now, id],
      );
    },
    /**
     * 작품 완전 삭제.
     * 백엔드 FK ON DELETE CASCADE로 연관 엔티티(plan, world_note, character, plot,
     * episode, foreshadow, idea_archive 등)가 서버 측에서 자동 정리된다.
     */
    deleteWork: async (id: string): Promise<void> => {
      await db.execute(`DELETE FROM work WHERE id = ?`, [id]);
    },

    // ── plan (work당 1개) ────────────────────────────────────
    /** 기존 plan 있으면 해당 id, 없으면 새로 생성 */
    ensurePlan: async (workId: string): Promise<string> => {
      const result = await db.execute(
        `SELECT id FROM plan WHERE work_id = ? LIMIT 1`,
        [workId],
      );
      const existing = (result.rows?._array as { id: string }[] | undefined)?.[0];
      if (existing) return existing.id;

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await db.execute(
        `INSERT INTO plan (id, work_id, writer_id, slogan, genres, moods, target_audience, created_at, updated_at)
         VALUES (?, ?, ?, NULL, NULL, NULL, NULL, ?, ?)`,
        [id, workId, writerId, now, now],
      );
      return id;
    },
    updatePlan: async (
      id: string,
      patch: Partial<{
        slogan: string | null;
        genres: string | null;
        moods: string | null;
        target_audience: string | null;
      }>,
    ): Promise<void> => {
      const now = new Date().toISOString();
      const fields = Object.keys(patch);
      if (fields.length === 0) return;
      const setClause = fields.map((f) => `${f} = ?`).join(', ');
      const values = fields.map((f) => patch[f as keyof typeof patch] ?? null);
      await db.execute(
        `UPDATE plan SET ${setClause}, updated_at = ? WHERE id = ?`,
        [...values, now, id],
      );
    },

    // ── plan_note (work당 1:N 자유 문서) ────────────────────
    createPlanNote: async (workId: string, title: string, sortOrder: number): Promise<string> => {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await db.execute(
        `INSERT INTO plan_note (id, work_id, writer_id, title, content, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`,
        [id, workId, writerId, title, sortOrder, now, now],
      );
      return id;
    },
    updatePlanNoteTitle: async (id: string, title: string): Promise<void> => {
      const now = new Date().toISOString();
      await db.execute(
        `UPDATE plan_note SET title = ?, updated_at = ? WHERE id = ?`,
        [title, now, id],
      );
    },
    updatePlanNoteContent: async (id: string, content: string): Promise<void> => {
      const now = new Date().toISOString();
      await db.execute(
        `UPDATE plan_note SET content = ?, updated_at = ? WHERE id = ?`,
        [content, now, id],
      );
    },

    // ── world_note ─────────────────────────────────────────
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

    // ── character ───────────────────────────────────────────
    createCharacter: async (
      workId: string,
      name: string,
      gender: string,
      age: string,
      sortOrder: number,
    ): Promise<string> => {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await db.execute(
        `INSERT INTO character (id, work_id, writer_id, name, profile_image_url, gender, age, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
        [id, workId, writerId, name, gender, age, sortOrder, now, now],
      );
      return id;
    },
    updateCharacter: async (
      id: string,
      patch: Partial<{
        name: string;
        gender: string;
        age: string;
      }>,
    ): Promise<void> => {
      const now = new Date().toISOString();
      const fields = Object.keys(patch);
      if (fields.length === 0) return;
      const setClause = fields.map((f) => `${f} = ?`).join(', ');
      const values = fields.map((f) => patch[f as keyof typeof patch] ?? null);
      await db.execute(
        `UPDATE character SET ${setClause}, updated_at = ? WHERE id = ?`,
        [...values, now, id],
      );
    },

    // ── character_note ───────────────────────────────────────
    /** 캐릭터에 기본 노트(외형·성격)가 없으면 자동 생성 (INSERT OR IGNORE로 중복 방지) */
    ensureCharacterNotes: async (characterId: string): Promise<void> => {
      const now = new Date().toISOString();
      // INSERT OR IGNORE — 이미 동일 kind가 있으면 무시 (race condition 방지)
      await db.execute(
        `INSERT OR IGNORE INTO character_note (id, character_id, writer_id, kind, title, content, sort_order, created_at, updated_at)
         SELECT ?, ?, ?, 'appearance', '외형', NULL, 0, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM character_note WHERE character_id = ? AND kind = 'appearance')`,
        [crypto.randomUUID(), characterId, writerId, now, now, characterId],
      );
      await db.execute(
        `INSERT OR IGNORE INTO character_note (id, character_id, writer_id, kind, title, content, sort_order, created_at, updated_at)
         SELECT ?, ?, ?, 'personality', '성격', NULL, 1, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM character_note WHERE character_id = ? AND kind = 'personality')`,
        [crypto.randomUUID(), characterId, writerId, now, now, characterId],
      );
    },
    createCharacterNote: async (characterId: string, title: string, sortOrder: number): Promise<string> => {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await db.execute(
        `INSERT INTO character_note (id, character_id, writer_id, kind, title, content, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, 'custom', ?, NULL, ?, ?, ?)`,
        [id, characterId, writerId, title, sortOrder, now, now],
      );
      return id;
    },
    updateCharacterNoteTitle: async (id: string, title: string): Promise<void> => {
      await db.execute(
        'UPDATE character_note SET title = ?, updated_at = ? WHERE id = ?',
        [title, new Date().toISOString(), id],
      );
    },
    updateCharacterNoteContent: async (id: string, content: string): Promise<void> => {
      await db.execute(
        'UPDATE character_note SET content = ?, updated_at = ? WHERE id = ?',
        [content, new Date().toISOString(), id],
      );
    },

    // ── plot ────────────────────────────────────────────────
    createPlot: async (workId: string, title: string, sortOrder: number): Promise<string> => {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await db.execute(
        `INSERT INTO plot (id, work_id, writer_id, parent_id, title, status, content, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, NULL, ?, '예정', NULL, ?, ?, ?)`,
        [id, workId, writerId, title, sortOrder, now, now],
      );
      return id;
    },
    updatePlot: async (
      id: string,
      patch: Partial<{ title: string; status: string; content: string | null }>,
    ): Promise<void> => {
      const now = new Date().toISOString();
      const fields = Object.keys(patch);
      if (fields.length === 0) return;
      const setClause = fields.map((f) => `${f} = ?`).join(', ');
      const values = fields.map((f) => patch[f as keyof typeof patch] ?? null);
      await db.execute(
        `UPDATE plot SET ${setClause}, updated_at = ? WHERE id = ?`,
        [...values, now, id],
      );
    },

    // ── episode ─────────────────────────────────────────────
    createEpisode: async (workId: string, title: string, sortOrder: number): Promise<string> => {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await db.execute(
        `INSERT INTO episode (id, work_id, writer_id, parent_id, title, status, content, word_count, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, NULL, ?, '미작성', NULL, 0, ?, ?, ?)`,
        [id, workId, writerId, title, sortOrder, now, now],
      );
      return id;
    },
    updateEpisode: async (
      id: string,
      patch: Partial<{
        title: string;
        status: string;
        content: string | null;
        word_count: number;
      }>,
    ): Promise<void> => {
      const now = new Date().toISOString();
      const fields = Object.keys(patch);
      if (fields.length === 0) return;
      const setClause = fields.map((f) => `${f} = ?`).join(', ');
      const values = fields.map((f) => patch[f as keyof typeof patch] ?? null);
      await db.execute(
        `UPDATE episode SET ${setClause}, updated_at = ? WHERE id = ?`,
        [...values, now, id],
      );
    },

    // ── foreshadow ─────────────────────────────────────────
    createForeshadow: async (
      workId: string,
      title: string,
      importance: string,
      sortOrder: number,
    ): Promise<string> => {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await db.execute(
        `INSERT INTO foreshadow (id, work_id, writer_id, title, status, importance, content, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, '진행중', ?, NULL, ?, ?, ?)`,
        [id, workId, writerId, title, importance, sortOrder, now, now],
      );
      return id;
    },
    updateForeshadow: async (
      id: string,
      patch: Partial<{
        title: string;
        status: string;
        importance: string;
        content: string | null;
      }>,
    ): Promise<void> => {
      const now = new Date().toISOString();
      const fields = Object.keys(patch);
      if (fields.length === 0) return;
      const setClause = fields.map((f) => `${f} = ?`).join(', ');
      const values = fields.map((f) => patch[f as keyof typeof patch] ?? null);
      await db.execute(
        `UPDATE foreshadow SET ${setClause}, updated_at = ? WHERE id = ?`,
        [...values, now, id],
      );
    },

    // ── idea_archive ───────────────────────────────────────
    createIdea: async (
      workId: string,
      content: string,
      tag: string | null,
      sortOrder: number,
    ): Promise<string> => {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await db.execute(
        `INSERT INTO idea_archive (id, work_id, writer_id, content, tag, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, workId, writerId, content, tag, sortOrder, now, now],
      );
      return id;
    },
    updateIdea: async (
      id: string,
      patch: Partial<{ content: string; tag: string | null }>,
    ): Promise<void> => {
      const now = new Date().toISOString();
      const fields = Object.keys(patch);
      if (fields.length === 0) return;
      const setClause = fields.map((f) => `${f} = ?`).join(', ');
      const values = fields.map((f) => patch[f as keyof typeof patch] ?? null);
      await db.execute(
        `UPDATE idea_archive SET ${setClause}, updated_at = ? WHERE id = ?`,
        [...values, now, id],
      );
    },
  };
}
