import { usePowerSync } from '@powersync/react';
import { useWriterId } from './useWriterId';
import { analytics, charCountBucket } from '../lib/analytics';

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

  const trackCreated = (docType: string, source = 'manual', templateType?: string) => {
    void analytics.track('document_created', {
      doc_type: docType,
      source,
      template_type: templateType,
    });
  };

  const trackSaved = (docType: string, content?: string | null) => {
    void analytics.track('document_saved', {
      doc_type: docType,
      char_count_bucket: charCountBucket(content?.length ?? 0),
    });
  };

  const trackDeleted = (docType: string) => {
    void analytics.track('document_deleted', {
      doc_type: docType,
    });
  };

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
      trackCreated('work');
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
      trackSaved('work');
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
      trackDeleted('work');
    },
    /** 휴지통에서 영구 삭제 — 실제 DELETE. CASCADE로 하위 엔티티 자동 정리. */
    permanentDeleteWork: async (id: string): Promise<void> => {
      await db.execute(`DELETE FROM work WHERE id = ?`, [id]);
      trackDeleted('work');
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
      trackCreated('plan', 'auto');
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
      trackSaved('plan');
    },

    // ── plan_note (work당 1:N 자유 문서) ────────────────────
    /**
     * @param content - 신규 문서 본문(TipTap JSON 직렬화 string). 템플릿 미리채우기 용도.
     *                  생략·null 시 빈 본문(NULL)으로 INSERT — 기존 동작 호환.
     */
    createPlanNote: async (
      workId: string,
      title: string,
      sortOrder: number,
      content: string | null = null,
    ): Promise<string> => {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await db.execute(
        `INSERT INTO plan_note (id, work_id, writer_id, title, content, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, workId, writerId, title, content, sortOrder, now, now],
      );
      trackCreated('plan_note', content ? 'template' : 'manual');
      return id;
    },
    updatePlanNoteTitle: async (id: string, title: string): Promise<void> => {
      const now = new Date().toISOString();
      await db.execute(
        `UPDATE plan_note SET title = ?, updated_at = ? WHERE id = ?`,
        [title, now, id],
      );
      trackSaved('plan_note');
    },
    updatePlanNoteContent: async (id: string, content: string): Promise<void> => {
      const now = new Date().toISOString();
      await db.execute(
        `UPDATE plan_note SET content = ?, updated_at = ? WHERE id = ?`,
        [content, now, id],
      );
      trackSaved('plan_note', content);
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
    /**
     * @param content 사전 채움 본문 (TipTap JSON 문자열). 미지정/null 시 빈 본문(NULL).
     *                복제(Duplicate) 시 원본 콘텐츠 보존 용도.
     */
    createWorldNote: async (
      workId: string,
      name: string,
      sortOrder: number,
      parentId?: string | null,
      content: string | null = null,
    ): Promise<string> => {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await db.execute(
        `INSERT INTO world_note (id, work_id, writer_id, parent_id, name, content, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, workId, writerId, parentId ?? null, name, content, sortOrder, now, now],
      );
      trackCreated('world_note', content ? 'template' : 'manual');
      return id;
    },
    updateWorldNoteContent: async (id: string, content: string): Promise<void> => {
      const now = new Date().toISOString();
      await db.execute(
        `UPDATE world_note SET content = ?, updated_at = ? WHERE id = ?`,
        [content, now, id],
      );
      trackSaved('world_note', content);
    },
    updateWorldNoteName: async (id: string, name: string): Promise<void> => {
      const now = new Date().toISOString();
      await db.execute(
        `UPDATE world_note SET name = ?, updated_at = ? WHERE id = ?`,
        [name, now, id],
      );
      trackSaved('world_note');
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
      trackCreated('character');
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
      trackSaved('character');
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
    /**
     * @param content 사전 채움 본문 (TipTap JSON). 미지정/null 시 빈 본문.
     *                복제 시 원본 콘텐츠 보존 용도. kind는 항상 'custom' — default kind
     *                ('intro'/'appearance'/'personality')는 ensureCharacterNotes 가 한 번만 만들고
     *                UNIQUE 보장하므로 사본은 자유 노트로 처리.
     */
    createCharacterNote: async (
      characterId: string,
      title: string,
      sortOrder: number,
      content: string | null = null,
    ): Promise<string> => {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await db.execute(
        `INSERT INTO character_note (id, character_id, writer_id, kind, title, content, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, 'custom', ?, ?, ?, ?, ?)`,
        [id, characterId, writerId, title, content, sortOrder, now, now],
      );
      trackCreated('character_note', content ? 'template' : 'manual');
      return id;
    },
    updateCharacterNoteTitle: async (id: string, title: string): Promise<void> => {
      await db.execute(
        'UPDATE character_note SET title = ?, updated_at = ? WHERE id = ?',
        [title, new Date().toISOString(), id],
      );
      trackSaved('character_note');
    },
    updateCharacterNoteContent: async (id: string, content: string): Promise<void> => {
      await db.execute(
        'UPDATE character_note SET content = ?, updated_at = ? WHERE id = ?',
        [content, new Date().toISOString(), id],
      );
      trackSaved('character_note', content);
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
    /**
     * @param content 사전 채움 본문 (TipTap JSON). 미지정/null 시 빈 본문.
     *                복제 시 원본 콘텐츠 보존 용도. status는 그대로 자동 결정(parentId 유무 기반).
     */
    createPlot: async (
      workId: string,
      title: string,
      sortOrder: number,
      parentId: string | null = null,
      content: string | null = null,
    ): Promise<string> => {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const status = parentId ? '예정' : null;
      await db.execute(
        `INSERT INTO plot (id, work_id, writer_id, parent_id, title, status, content, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, workId, writerId, parentId, title, status, content, sortOrder, now, now],
      );
      trackCreated('plot', content ? 'template' : 'manual');
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
      trackSaved('plot', patch.content);
    },

    // ── episode ─────────────────────────────────────────────
    /**
     * @param content 사전 채움 본문 (TipTap JSON). 미지정/null 시 빈 본문.
     *                복제 시 원본 콘텐츠 보존 용도. status는 항상 '미작성'으로 reset
     *                (사본은 신규 작성 의미라 출고 상태 초기화).
     */
    createEpisode: async (
      workId: string,
      title: string,
      sortOrder: number,
      content: string | null = null,
    ): Promise<string> => {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await db.execute(
        `INSERT INTO episode (id, work_id, writer_id, parent_id, title, status, content, word_count, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, NULL, ?, '미작성', ?, 0, ?, ?, ?)`,
        [id, workId, writerId, title, content, sortOrder, now, now],
      );
      trackCreated('episode', content ? 'template' : 'manual');
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
      trackSaved('episode', patch.content);
    },

    /** 원고 소프트 삭제 — status를 'trashed'로 변경. */
    trashEpisode: async (id: string): Promise<void> => {
      const now = new Date().toISOString();
      await db.execute(
        `UPDATE episode SET status = 'trashed', updated_at = ? WHERE id = ?`,
        [now, id],
      );
      trackDeleted('episode');
    },
    /** 휴지통에서 원고 영구 삭제. */
    permanentDeleteEpisode: async (id: string): Promise<void> => {
      await db.execute(`DELETE FROM episode WHERE id = ?`, [id]);
      trackDeleted('episode');
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
      trackCreated('foreshadow');
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
      trackSaved('foreshadow', patch.content);
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
      trackCreated('idea_archive');
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
      trackSaved('idea_archive', patch.content);
    },

    // ── 하드 삭제 ──────────────────────────────────────────
    deleteCharacter: async (id: string): Promise<void> => {
      await db.execute(`DELETE FROM character WHERE id = ?`, [id]);
      trackDeleted('character');
    },
    deleteCharacterNote: async (id: string): Promise<void> => {
      await db.execute(`DELETE FROM character_note WHERE id = ?`, [id]);
      trackDeleted('character_note');
    },
    deleteWorldNote: async (id: string): Promise<void> => {
      await db.execute(`DELETE FROM world_note WHERE id = ?`, [id]);
      trackDeleted('world_note');
    },
    deletePlanNote: async (id: string): Promise<void> => {
      await db.execute(`DELETE FROM plan_note WHERE id = ?`, [id]);
      trackDeleted('plan_note');
    },
    deleteForeshadow: async (id: string): Promise<void> => {
      await db.execute(`DELETE FROM foreshadow WHERE id = ?`, [id]);
      trackDeleted('foreshadow');
    },
    deleteIdeaArchive: async (id: string): Promise<void> => {
      await db.execute(`DELETE FROM idea_archive WHERE id = ?`, [id]);
      trackDeleted('idea_archive');
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

    /** 플롯 전용 — parent_id 이동(막↔회차) + sort_order 변경 */
    movePlot: async (
      id: string,
      newParentId: string | null,
      sortOrder: number,
    ): Promise<void> => {
      const now = new Date().toISOString();
      await db.execute(
        'UPDATE plot SET parent_id = ?, sort_order = ?, updated_at = ? WHERE id = ?',
        [newParentId, sortOrder, now, id],
      );
    },

    /**
     * world_note를 새 부모의 형제 사이 특정 위치에 배치.
     * - parent_id 변경 + 새 부모의 모든 자식 sort_order를 0,1000,2000... 재부여
     * - position: 'before'|'after' anchorId, 또는 'end'(anchorId 무시)
     * 정렬 정확도 보장 — sort_order=Date.now() 패턴 대체.
     */
    placeWorldNote: async (
      activeId: string,
      newParentId: string | null,
      anchorId: string | null,
      position: 'before' | 'after' | 'end',
    ): Promise<void> => {
      const now = new Date().toISOString();
      const sql =
        newParentId === null
          ? `SELECT id FROM world_note
             WHERE parent_id IS NULL AND id != ?
             ORDER BY sort_order ASC, created_at ASC`
          : `SELECT id FROM world_note
             WHERE parent_id = ? AND id != ?
             ORDER BY sort_order ASC, created_at ASC`;
      const params =
        newParentId === null ? [activeId] : [newParentId, activeId];
      const r = await db.execute(sql, params);
      const ids =
        (r.rows?._array as { id: string }[] | undefined)?.map((x) => x.id) ?? [];

      let insertIdx: number;
      if (position === 'end' || !anchorId) {
        insertIdx = ids.length;
      } else {
        const anchorIdx = ids.findIndex((id) => id === anchorId);
        insertIdx =
          anchorIdx === -1
            ? ids.length
            : position === 'before'
              ? anchorIdx
              : anchorIdx + 1;
      }
      const newOrder = [...ids.slice(0, insertIdx), activeId, ...ids.slice(insertIdx)];

      await db.execute(
        'UPDATE world_note SET parent_id = ?, updated_at = ? WHERE id = ?',
        [newParentId, now, activeId],
      );
      for (let i = 0; i < newOrder.length; i++) {
        await db.execute(
          'UPDATE world_note SET sort_order = ?, updated_at = ? WHERE id = ?',
          [i * 1000, now, newOrder[i]],
        );
      }
    },

    /** plot 전용 — placeWorldNote와 동일 패턴 */
    placePlot: async (
      activeId: string,
      newParentId: string | null,
      anchorId: string | null,
      position: 'before' | 'after' | 'end',
    ): Promise<void> => {
      const now = new Date().toISOString();
      const sql =
        newParentId === null
          ? `SELECT id FROM plot
             WHERE parent_id IS NULL AND id != ?
             ORDER BY sort_order ASC, created_at ASC`
          : `SELECT id FROM plot
             WHERE parent_id = ? AND id != ?
             ORDER BY sort_order ASC, created_at ASC`;
      const params =
        newParentId === null ? [activeId] : [newParentId, activeId];
      const r = await db.execute(sql, params);
      const ids =
        (r.rows?._array as { id: string }[] | undefined)?.map((x) => x.id) ?? [];

      let insertIdx: number;
      if (position === 'end' || !anchorId) {
        insertIdx = ids.length;
      } else {
        const anchorIdx = ids.findIndex((id) => id === anchorId);
        insertIdx =
          anchorIdx === -1
            ? ids.length
            : position === 'before'
              ? anchorIdx
              : anchorIdx + 1;
      }
      const newOrder = [...ids.slice(0, insertIdx), activeId, ...ids.slice(insertIdx)];

      await db.execute(
        'UPDATE plot SET parent_id = ?, updated_at = ? WHERE id = ?',
        [newParentId, now, activeId],
      );
      for (let i = 0; i < newOrder.length; i++) {
        await db.execute(
          'UPDATE plot SET sort_order = ?, updated_at = ? WHERE id = ?',
          [i * 1000, now, newOrder[i]],
        );
      }
    },

    /** plan_note 전용 — 평탄 리스트, work_id 그룹 안 sort_order reindex */
    placePlanNote: async (
      activeId: string,
      workId: string,
      anchorId: string | null,
      position: 'before' | 'after' | 'end',
    ): Promise<void> => {
      const now = new Date().toISOString();
      const r = await db.execute(
        `SELECT id FROM plan_note WHERE work_id = ? AND id != ?
         ORDER BY sort_order ASC, created_at ASC`,
        [workId, activeId],
      );
      const ids =
        (r.rows?._array as { id: string }[] | undefined)?.map((x) => x.id) ?? [];
      let insertIdx: number;
      if (position === 'end' || !anchorId) insertIdx = ids.length;
      else {
        const anchorIdx = ids.findIndex((id) => id === anchorId);
        insertIdx =
          anchorIdx === -1
            ? ids.length
            : position === 'before'
              ? anchorIdx
              : anchorIdx + 1;
      }
      const newOrder = [...ids.slice(0, insertIdx), activeId, ...ids.slice(insertIdx)];
      for (let i = 0; i < newOrder.length; i++) {
        await db.execute(
          'UPDATE plan_note SET sort_order = ?, updated_at = ? WHERE id = ?',
          [i * 1000, now, newOrder[i]],
        );
      }
    },

    /** episode 전용 — 평탄 노출, work_id 그룹, parent_id 변경 안 함 */
    placeEpisode: async (
      activeId: string,
      workId: string,
      anchorId: string | null,
      position: 'before' | 'after' | 'end',
    ): Promise<void> => {
      const now = new Date().toISOString();
      const r = await db.execute(
        `SELECT id FROM episode WHERE work_id = ? AND id != ?
         ORDER BY sort_order ASC, created_at ASC`,
        [workId, activeId],
      );
      const ids =
        (r.rows?._array as { id: string }[] | undefined)?.map((x) => x.id) ?? [];
      let insertIdx: number;
      if (position === 'end' || !anchorId) insertIdx = ids.length;
      else {
        const anchorIdx = ids.findIndex((id) => id === anchorId);
        insertIdx =
          anchorIdx === -1
            ? ids.length
            : position === 'before'
              ? anchorIdx
              : anchorIdx + 1;
      }
      const newOrder = [...ids.slice(0, insertIdx), activeId, ...ids.slice(insertIdx)];
      for (let i = 0; i < newOrder.length; i++) {
        await db.execute(
          'UPDATE episode SET sort_order = ?, updated_at = ? WHERE id = ?',
          [i * 1000, now, newOrder[i]],
        );
      }
    },

    /** foreshadow 전용 — 평탄, work_id */
    placeForeshadow: async (
      activeId: string,
      workId: string,
      anchorId: string | null,
      position: 'before' | 'after' | 'end',
    ): Promise<void> => {
      const now = new Date().toISOString();
      const r = await db.execute(
        `SELECT id FROM foreshadow WHERE work_id = ? AND id != ?
         ORDER BY sort_order ASC, created_at ASC`,
        [workId, activeId],
      );
      const ids =
        (r.rows?._array as { id: string }[] | undefined)?.map((x) => x.id) ?? [];
      let insertIdx: number;
      if (position === 'end' || !anchorId) insertIdx = ids.length;
      else {
        const anchorIdx = ids.findIndex((id) => id === anchorId);
        insertIdx =
          anchorIdx === -1
            ? ids.length
            : position === 'before'
              ? anchorIdx
              : anchorIdx + 1;
      }
      const newOrder = [...ids.slice(0, insertIdx), activeId, ...ids.slice(insertIdx)];
      for (let i = 0; i < newOrder.length; i++) {
        await db.execute(
          'UPDATE foreshadow SET sort_order = ?, updated_at = ? WHERE id = ?',
          [i * 1000, now, newOrder[i]],
        );
      }
    },

    /** idea_archive 전용 — 평탄, work_id */
    placeIdea: async (
      activeId: string,
      workId: string,
      anchorId: string | null,
      position: 'before' | 'after' | 'end',
    ): Promise<void> => {
      const now = new Date().toISOString();
      const r = await db.execute(
        `SELECT id FROM idea_archive WHERE work_id = ? AND id != ?
         ORDER BY sort_order ASC, created_at ASC`,
        [workId, activeId],
      );
      const ids =
        (r.rows?._array as { id: string }[] | undefined)?.map((x) => x.id) ?? [];
      let insertIdx: number;
      if (position === 'end' || !anchorId) insertIdx = ids.length;
      else {
        const anchorIdx = ids.findIndex((id) => id === anchorId);
        insertIdx =
          anchorIdx === -1
            ? ids.length
            : position === 'before'
              ? anchorIdx
              : anchorIdx + 1;
      }
      const newOrder = [...ids.slice(0, insertIdx), activeId, ...ids.slice(insertIdx)];
      for (let i = 0; i < newOrder.length; i++) {
        await db.execute(
          'UPDATE idea_archive SET sort_order = ?, updated_at = ? WHERE id = ?',
          [i * 1000, now, newOrder[i]],
        );
      }
    },

    /** work 전용 — writer_id 기준 평탄 */
    placeWork: async (
      activeId: string,
      anchorId: string | null,
      position: 'before' | 'after' | 'end',
    ): Promise<void> => {
      const now = new Date().toISOString();
      const r = await db.execute(
        `SELECT id FROM work WHERE writer_id = ? AND id != ?
         ORDER BY sort_order ASC, created_at ASC`,
        [writerId, activeId],
      );
      const ids =
        (r.rows?._array as { id: string }[] | undefined)?.map((x) => x.id) ?? [];
      let insertIdx: number;
      if (position === 'end' || !anchorId) insertIdx = ids.length;
      else {
        const anchorIdx = ids.findIndex((id) => id === anchorId);
        insertIdx =
          anchorIdx === -1
            ? ids.length
            : position === 'before'
              ? anchorIdx
              : anchorIdx + 1;
      }
      const newOrder = [...ids.slice(0, insertIdx), activeId, ...ids.slice(insertIdx)];
      for (let i = 0; i < newOrder.length; i++) {
        await db.execute(
          'UPDATE work SET sort_order = ?, updated_at = ? WHERE id = ?',
          [i * 1000, now, newOrder[i]],
        );
      }
    },

    /** character 전용 — work_id 기준 평탄 */
    placeCharacter: async (
      activeId: string,
      workId: string,
      anchorId: string | null,
      position: 'before' | 'after' | 'end',
    ): Promise<void> => {
      const now = new Date().toISOString();
      const r = await db.execute(
        `SELECT id FROM character WHERE work_id = ? AND id != ?
         ORDER BY sort_order ASC, created_at ASC`,
        [workId, activeId],
      );
      const ids =
        (r.rows?._array as { id: string }[] | undefined)?.map((x) => x.id) ?? [];
      let insertIdx: number;
      if (position === 'end' || !anchorId) insertIdx = ids.length;
      else {
        const anchorIdx = ids.findIndex((id) => id === anchorId);
        insertIdx =
          anchorIdx === -1
            ? ids.length
            : position === 'before'
              ? anchorIdx
              : anchorIdx + 1;
      }
      const newOrder = [...ids.slice(0, insertIdx), activeId, ...ids.slice(insertIdx)];
      for (let i = 0; i < newOrder.length; i++) {
        await db.execute(
          'UPDATE character SET sort_order = ?, updated_at = ? WHERE id = ?',
          [i * 1000, now, newOrder[i]],
        );
      }
    },

    /** character_note 전용 — character_id 그룹 안 정렬 (cross-character 이동 X) */
    placeCharacterNote: async (
      activeId: string,
      characterId: string,
      anchorId: string | null,
      position: 'before' | 'after' | 'end',
    ): Promise<void> => {
      const now = new Date().toISOString();
      const r = await db.execute(
        `SELECT id FROM character_note WHERE character_id = ? AND id != ?
         ORDER BY sort_order ASC, created_at ASC`,
        [characterId, activeId],
      );
      const ids =
        (r.rows?._array as { id: string }[] | undefined)?.map((x) => x.id) ?? [];
      let insertIdx: number;
      if (position === 'end' || !anchorId) insertIdx = ids.length;
      else {
        const anchorIdx = ids.findIndex((id) => id === anchorId);
        insertIdx =
          anchorIdx === -1
            ? ids.length
            : position === 'before'
              ? anchorIdx
              : anchorIdx + 1;
      }
      const newOrder = [...ids.slice(0, insertIdx), activeId, ...ids.slice(insertIdx)];
      for (let i = 0; i < newOrder.length; i++) {
        await db.execute(
          'UPDATE character_note SET sort_order = ?, updated_at = ? WHERE id = ?',
          [i * 1000, now, newOrder[i]],
        );
      }
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
