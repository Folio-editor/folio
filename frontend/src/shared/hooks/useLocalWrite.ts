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
     * 작품 소프트 삭제 — status를 'trashed'로 변경하여 휴지통으로 이동.
     * 30일 후 백엔드 배치 작업으로 영구 삭제된다.
     */
    deleteWork: async (id: string): Promise<void> => {
      const now = new Date().toISOString();
      await db.execute(
        `UPDATE work SET status = 'trashed', updated_at = ? WHERE id = ?`,
        [now, id],
      );
    },
    /** 휴지통에서 영구 삭제 — 실제 DELETE. CASCADE로 하위 엔티티 자동 정리. */
    permanentDeleteWork: async (id: string): Promise<void> => {
      await db.execute(`DELETE FROM work WHERE id = ?`, [id]);
    },
    /** 휴지통에서 작품 복원 — status를 '연재중'으로 되돌린다. */
    restoreWork: async (id: string): Promise<void> => {
      const now = new Date().toISOString();
      await db.execute(
        `UPDATE work SET status = '연재중', updated_at = ? WHERE id = ?`,
        [now, id],
      );
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
    /** 세계관 최초 진입 시 기본 템플릿 5개 자동 생성 (이미 문서가 있으면 skip) */
    ensureWorldNoteTemplates: async (workId: string): Promise<void> => {
      const result = await db.execute(
        'SELECT COUNT(*) AS cnt FROM world_note WHERE work_id = ? AND writer_id = ?',
        [workId, writerId],
      );
      const count = (result.rows?._array as { cnt: number }[] | undefined)?.[0]?.cnt ?? 0;
      if (count > 0) return;

      const templates = ['시대/배경', '공간/지리', '세력/조직', '규칙/법칙', '역사/연표'];
      const now = new Date().toISOString();
      for (let i = 0; i < templates.length; i++) {
        await db.execute(
          `INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, NULL, ?, NULL, ?, ?, ?)`,
          [crypto.randomUUID(), workId, writerId, templates[i], i, now, now],
        );
      }
    },
    createWorldNote: async (
      workId: string,
      name: string,
      sortOrder: number,
      parentId?: string | null,
    ): Promise<string> => {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await db.execute(
        `INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
        [id, workId, writerId, parentId ?? null, name, sortOrder, now, now],
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
        profile_image_url: string | null;
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
      await db.execute(
        `INSERT OR IGNORE INTO character_note (id, character_id, writer_id, kind, title, content, sort_order, created_at, updated_at)
         SELECT ?, ?, ?, 'intro', '한 줄 소개', NULL, 0, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM character_note WHERE character_id = ? AND kind = 'intro')`,
        [crypto.randomUUID(), characterId, writerId, now, now, characterId],
      );
      // INSERT OR IGNORE — 이미 동일 kind가 있으면 무시 (race condition 방지)
      await db.execute(
        `INSERT OR IGNORE INTO character_note (id, character_id, writer_id, kind, title, content, sort_order, created_at, updated_at)
         SELECT ?, ?, ?, 'appearance', '외형', NULL, 1, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM character_note WHERE character_id = ? AND kind = 'appearance')`,
        [crypto.randomUUID(), characterId, writerId, now, now, characterId],
      );
      await db.execute(
        `INSERT OR IGNORE INTO character_note (id, character_id, writer_id, kind, title, content, sort_order, created_at, updated_at)
         SELECT ?, ?, ?, 'personality', '성격', NULL, 2, ?, ?
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

    // ── character_tag ─────────────────────────────────────────
    createCharacterTag: async (characterId: string, worldNoteId: string): Promise<string> => {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await db.execute(
        `INSERT OR IGNORE INTO character_tag (id, character_id, world_note_id, created_at)
         VALUES (?, ?, ?, ?)`,
        [id, characterId, worldNoteId, now],
      );
      return id;
    },
    deleteCharacterTag: async (characterId: string, worldNoteId: string): Promise<void> => {
      await db.execute(
        'DELETE FROM character_tag WHERE character_id = ? AND world_note_id = ?',
        [characterId, worldNoteId],
      );
    },

    // ── plot ────────────────────────────────────────────────
    createPlot: async (
      workId: string,
      title: string,
      sortOrder: number,
      parentId: string | null = null,
    ): Promise<string> => {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const status = parentId ? '예정' : null;
      await db.execute(
        `INSERT INTO plot (id, work_id, writer_id, parent_id, title, status, content, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
        [id, workId, writerId, parentId, title, status, sortOrder, now, now],
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
    createEpisode: async (
      workId: string,
      title: string,
      sortOrder: number,
    ): Promise<string> => {
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

    /** 원고 소프트 삭제 — status를 'trashed'로 변경. */
    trashEpisode: async (id: string): Promise<void> => {
      const now = new Date().toISOString();
      await db.execute(
        `UPDATE episode SET status = 'trashed', updated_at = ? WHERE id = ?`,
        [now, id],
      );
    },
    /** 휴지통에서 원고 영구 삭제. */
    permanentDeleteEpisode: async (id: string): Promise<void> => {
      await db.execute(`DELETE FROM episode WHERE id = ?`, [id]);
    },
    /** 휴지통에서 원고 복원 — status를 '미작성'으로 되돌린다. */
    restoreEpisode: async (id: string): Promise<void> => {
      const now = new Date().toISOString();
      await db.execute(
        `UPDATE episode SET status = '미작성', updated_at = ? WHERE id = ?`,
        [now, id],
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

    // ── 하드 삭제 ──────────────────────────────────────────
    deleteCharacter: async (id: string): Promise<void> => {
      await db.execute(`DELETE FROM character WHERE id = ?`, [id]);
    },
    deleteCharacterNote: async (id: string): Promise<void> => {
      await db.execute(`DELETE FROM character_note WHERE id = ?`, [id]);
    },
    deleteWorldNote: async (id: string): Promise<void> => {
      await db.execute(`DELETE FROM world_note WHERE id = ?`, [id]);
    },
    deletePlanNote: async (id: string): Promise<void> => {
      await db.execute(`DELETE FROM plan_note WHERE id = ?`, [id]);
    },
    deleteForeshadow: async (id: string): Promise<void> => {
      await db.execute(`DELETE FROM foreshadow WHERE id = ?`, [id]);
    },
    deleteIdeaArchive: async (id: string): Promise<void> => {
      await db.execute(`DELETE FROM idea_archive WHERE id = ?`, [id]);
    },

    // ── 정렬/이동 ──────────────────────────────────────────
    /** 범용 sort_order 일괄 업데이트 — 트랜잭션으로 처리 */
    reorderItems: async (
      table: string,
      items: { id: string; sortOrder: number }[],
    ): Promise<void> => {
      if (items.length === 0) return;
      const now = new Date().toISOString();
      await db.writeTransaction(async (tx) => {
        for (const item of items) {
          await tx.execute(
            `UPDATE ${table} SET sort_order = ?, updated_at = ? WHERE id = ?`,
            [item.sortOrder, now, item.id],
          );
        }
      });
    },

    /** 세계관 전용 — parent_id 이동 + sort_order 변경 */
    moveWorldNote: async (
      id: string,
      newParentId: string | null,
      sortOrder: number,
    ): Promise<void> => {
      const now = new Date().toISOString();
      await db.execute(
        'UPDATE world_note SET parent_id = ?, sort_order = ?, updated_at = ? WHERE id = ?',
        [newParentId, sortOrder, now, id],
      );
    },

    /** 원고 sort_order 변경 */
    moveEpisode: async (
      id: string,
      sortOrder: number,
    ): Promise<void> => {
      const now = new Date().toISOString();
      await db.execute(
        'UPDATE episode SET sort_order = ?, updated_at = ? WHERE id = ?',
        [sortOrder, now, id],
      );
    },

    // ── plot_episode_link ──────────────────────────────────
    linkPlotEpisode: async (plotId: string, episodeId: string): Promise<string> => {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await db.execute(
        'INSERT INTO plot_episode_link (id, plot_id, episode_id, created_at) VALUES (?, ?, ?, ?)',
        [id, plotId, episodeId, now],
      );
      return id;
    },
    unlinkPlotEpisode: async (linkId: string): Promise<void> => {
      await db.execute('DELETE FROM plot_episode_link WHERE id = ?', [linkId]);
    },
    deletePlot: async (id: string): Promise<void> => {
      await db.execute('DELETE FROM plot_episode_link WHERE plot_id = ?', [id]);
      await db.execute('DELETE FROM plot WHERE id = ?', [id]);
    },

    // ── foreshadow_link ────────────────────────────────────
    createForeshadowLink: async (
      foreshadowId: string,
      linkType: string,
      episodeId: string | null,
      plotId: string | null,
      contextMemo: string | null = null,
    ): Promise<string> => {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await db.execute(
        `INSERT INTO foreshadow_link (id, foreshadow_id, link_type, episode_id, plot_id, context_memo, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, foreshadowId, linkType, episodeId, plotId, contextMemo, now],
      );
      return id;
    },
    updateForeshadowLink: async (
      linkId: string,
      values: {
        linkType: string;
        episodeId: string | null;
        plotId: string | null;
        contextMemo: string | null;
      },
    ): Promise<void> => {
      await db.execute(
        `UPDATE foreshadow_link
         SET link_type = ?, episode_id = ?, plot_id = ?, context_memo = ?
         WHERE id = ?`,
        [values.linkType, values.episodeId, values.plotId, values.contextMemo, linkId],
      );
    },
    deleteForeshadowLink: async (linkId: string): Promise<void> => {
      await db.execute('DELETE FROM foreshadow_link WHERE id = ?', [linkId]);
    },
  };
}
