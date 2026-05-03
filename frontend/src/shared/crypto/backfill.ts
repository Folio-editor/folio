/**
 * Plan C 옵션 1 — 평문 row 백필 마이그레이션.
 *
 * <p>PR2 이전에 생성된 row, 그리고 KEK 없이 게스트 모드로 만든 후 로그인한 row는 'v1:' 접두사 없이
 * 평문 그대로 SQLite에 남아 있다. 이 모듈은 로그인 + KEK 도출 직후 백그라운드에서
 * 모든 작품을 순회하며 평문 컬럼을 v1: 암호문으로 재기록한다.
 *
 * <p>서버는 단독으로 백필을 할 수 없다 — KEK은 클라이언트 메모리에만 존재한다. 그래서
 * 이 백필은 클라이언트에서 한 번 돌고, PowerSync upload 큐를 통해 서버로 전파된다.
 *
 * <p>이중 암호화 방지: 모든 path에서 `'v1:'` 접두사로 시작하지 않는 값만 처리한다. 이미
 * 암호문인 값은 SELECT 단계에서 제외(`NOT LIKE 'v1:%'`)되고, 혹시 통과해도 prefix 가드로
 * 한 번 더 거른다.
 */

import type { AbstractPowerSyncDatabase } from '@powersync/web';
import { encryptString } from './cipher';
import { ensureWorkKey } from './workKey';

export const CIPHERTEXT_PREFIX = 'v1:';

/**
 * 백필 대상 정의.
 *
 * <p>각 항목은 (테이블, 암호화 컬럼들, 행 → workId 해석 SQL) 을 묶는다.
 * `workIdJoin`은 행의 `id` 와 함께 `SELECT ... FROM <table> ... WHERE <table>.id = ?`
 * 모양으로 사용된다. 직접 work_id 컬럼이 있는 테이블은 단순 SELECT, 그렇지 않은
 * 테이블(character_note 등)은 JOIN으로 거슬러 올라간다.
 */
export interface BackfillTarget {
  table: string;
  /** 암호화해야 하는 컬럼 이름들. */
  columns: readonly string[];
  /**
   * 해당 테이블 행의 id → work_id 해석 SQL. `?` 자리에 행의 id가 바인드된다.
   * SELECT 한 줄에 work_id 컬럼이 들어 있어야 한다.
   */
  workIdSql: string;
}

export const BACKFILL_TARGETS: readonly BackfillTarget[] = [
  // work 자체는 이 모듈에서 별도 처리한다 — 행 자신의 id가 곧 work_id 이고
  // encrypted_dek wrap을 위해 row가 미리 존재해야 한다.
  {
    table: 'character',
    columns: ['name', 'age'],
    workIdSql: 'SELECT work_id FROM character WHERE id = ?',
  },
  {
    table: 'character_note',
    columns: ['title', 'content'],
    workIdSql:
      'SELECT c.work_id AS work_id FROM character_note cn JOIN character c ON c.id = cn.character_id WHERE cn.id = ?',
  },
  {
    table: 'character_custom_field',
    columns: ['field_name', 'field_value'],
    workIdSql:
      'SELECT c.work_id AS work_id FROM character_custom_field ccf JOIN character c ON c.id = ccf.character_id WHERE ccf.id = ?',
  },
  {
    table: 'episode',
    columns: ['title', 'content'],
    workIdSql: 'SELECT work_id FROM episode WHERE id = ?',
  },
  {
    table: 'plan_note',
    columns: ['title', 'content'],
    workIdSql: 'SELECT work_id FROM plan_note WHERE id = ?',
  },
  {
    table: 'world_note',
    columns: ['name', 'content'],
    workIdSql: 'SELECT work_id FROM world_note WHERE id = ?',
  },
  {
    table: 'plot',
    columns: ['title', 'content'],
    workIdSql: 'SELECT work_id FROM plot WHERE id = ?',
  },
  {
    table: 'foreshadow',
    columns: ['title', 'content'],
    workIdSql: 'SELECT work_id FROM foreshadow WHERE id = ?',
  },
  {
    table: 'foreshadow_link',
    columns: ['context_memo'],
    workIdSql:
      'SELECT f.work_id AS work_id FROM foreshadow_link fl JOIN foreshadow f ON f.id = fl.foreshadow_id WHERE fl.id = ?',
  },
  {
    table: 'idea_archive',
    columns: ['content'],
    workIdSql: 'SELECT work_id FROM idea_archive WHERE id = ?',
  },
] as const;

/** 컬럼 값이 평문인지 (암호화가 필요한지) — 'v1:' 접두사가 없고 비어있지 않은 문자열. */
function needsEncryption(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !value.startsWith(CIPHERTEXT_PREFIX)
  );
}

/** SELECT한 행을 SQLite 표준 형태로 정규화. PowerSync는 result.rows._array를 사용한다. */
function rowsOf<T>(result: { rows?: { _array?: T[] } | null }): T[] {
  return (result.rows?._array as T[] | undefined) ?? [];
}

export interface BackfillProgress {
  /** 처리 완료된 행 수 (work 행 + 자식 테이블 행 합산). */
  processed: number;
  /** 발견된 평문 행 수. processed와 같아지면 끝. */
  total: number;
  /** 현재 처리 중인 테이블 (UI 진행 표시용). */
  currentTable: string | null;
}

export interface RunBackfillParams {
  db: AbstractPowerSyncDatabase;
  kek: CryptoKey;
  writerId: string;
  /** 진행률 갱신 콜백. 너무 자주 호출되지 않도록 호출자가 throttle 해도 된다. */
  onProgress?: (progress: BackfillProgress) => void;
  /** AbortSignal로 중단 요청 — 다음 row 처리 직전에 throw 한다. */
  signal?: AbortSignal;
}

/**
 * 한 writer의 모든 work + 그 안의 평문 row를 v1: 암호문으로 재기록.
 *
 * <p>1단계: 해당 writer의 work 행을 모두 SELECT 해서 work별로 처리.
 * <p>2단계: work마다 ensureWorkKey 로 work_key 확보 (encrypted_dek 가 NULL이면 신규 생성).
 * <p>3단계: 각 BACKFILL_TARGETS 테이블에서 평문 row를 batched SELECT → 암호화 → UPDATE.
 * <p>4단계: work 자신의 평문 컬럼(title/author_name/description)도 같은 work_key로 암호화.
 *
 * <p>이 함수는 idempotent: 두 번 돌려도 이미 v1: 인 행은 NOT LIKE 'v1:%'에 걸리지 않아 패스한다.
 */
export async function runBackfillForWriter(
  params: RunBackfillParams,
): Promise<BackfillProgress> {
  const { db, kek, writerId, onProgress, signal } = params;
  const progress: BackfillProgress = { processed: 0, total: 0, currentTable: null };
  const checkAbort = () => {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
  };

  // 1) 이 writer의 work 행 전체 — 작품마다 work_key가 다르므로 work_id 단위로 묶는다.
  const works = rowsOf<{ id: string }>(
    await db.execute(`SELECT id FROM work WHERE writer_id = ?`, [writerId]),
  );

  // 2) 모든 대상 테이블에서 평문 row 총량 카운트 — UX progress 용이라 정확성보다 대략값.
  for (const target of BACKFILL_TARGETS) {
    const where = target.columns
      .map((c) => `(${c} IS NOT NULL AND ${c} != '' AND ${c} NOT LIKE 'v1:%')`)
      .join(' OR ');
    const countRow = rowsOf<{ n: number }>(
      await db.execute(`SELECT COUNT(*) AS n FROM ${target.table} WHERE ${where}`),
    )[0];
    progress.total += countRow?.n ?? 0;
  }
  // work 자체 — 각 work 당 최대 1 (title/author_name/description 묶음)
  {
    const w = rowsOf<{ n: number }>(
      await db.execute(
        `SELECT COUNT(*) AS n FROM work
         WHERE writer_id = ?
           AND ((title IS NOT NULL AND title != '' AND title NOT LIKE 'v1:%')
             OR (author_name IS NOT NULL AND author_name != '' AND author_name NOT LIKE 'v1:%')
             OR (description IS NOT NULL AND description != '' AND description NOT LIKE 'v1:%'))`,
        [writerId],
      ),
    )[0];
    progress.total += w?.n ?? 0;
  }
  onProgress?.({ ...progress });

  // 3) work별 처리. 평문 row가 한 건도 없으면 work_key 신규 생성을 건너뛴다 (encrypted_dek = NULL
  // 인 work에 불필요한 wrap을 만들지 않기 위함). 처음 평문이 발견되면 lazily ensureWorkKey 호출.
  for (const work of works) {
    checkAbort();

    if (!(await workHasPlaintextRows(db, work.id, writerId))) continue;

    const workKey = await ensureWorkKey({
      kek,
      workId: work.id,
      loadEncryptedDek: async () => {
        const dr = await db.execute(
          'SELECT encrypted_dek FROM work WHERE id = ? LIMIT 1',
          [work.id],
        );
        const row = rowsOf<{ encrypted_dek: string | null }>(dr)[0];
        return row?.encrypted_dek ?? null;
      },
      saveEncryptedDek: async (b64) => {
        const now = new Date().toISOString();
        await db.execute(
          'UPDATE work SET encrypted_dek = ?, updated_at = ? WHERE id = ?',
          [b64, now, work.id],
        );
      },
    });

    // 3-1) work 자기 자신의 평문 컬럼 암호화.
    progress.currentTable = 'work';
    onProgress?.({ ...progress });
    const workRow = rowsOf<{
      title: string | null;
      author_name: string | null;
      description: string | null;
    }>(
      await db.execute(
        `SELECT title, author_name, description FROM work WHERE id = ?`,
        [work.id],
      ),
    )[0];
    if (workRow) {
      const updates: Array<[string, string]> = [];
      if (needsEncryption(workRow.title)) {
        updates.push(['title', CIPHERTEXT_PREFIX + (await encryptString(workKey, workRow.title))]);
      }
      if (needsEncryption(workRow.author_name)) {
        updates.push([
          'author_name',
          CIPHERTEXT_PREFIX + (await encryptString(workKey, workRow.author_name)),
        ]);
      }
      if (needsEncryption(workRow.description)) {
        updates.push([
          'description',
          CIPHERTEXT_PREFIX + (await encryptString(workKey, workRow.description)),
        ]);
      }
      if (updates.length > 0) {
        const now = new Date().toISOString();
        const setSql = updates.map(([c]) => `${c} = ?`).join(', ');
        await db.execute(
          `UPDATE work SET ${setSql}, updated_at = ? WHERE id = ?`,
          [...updates.map(([, v]) => v), now, work.id],
        );
        progress.processed += 1;
        onProgress?.({ ...progress });
      }
    }

    // 3-2) 자식 테이블들 — 이 work에 속한 평문 row만 골라낸다.
    for (const target of BACKFILL_TARGETS) {
      checkAbort();
      progress.currentTable = target.table;
      onProgress?.({ ...progress });

      // 컬럼별 평문 조건
      const orWhere = target.columns
        .map((c) => `(${c} IS NOT NULL AND ${c} != '' AND ${c} NOT LIKE 'v1:%')`)
        .join(' OR ');

      // 이 work에 속하는 행만 — workIdSql을 join 형태로 풀어 사용. 일관성을 위해
      // 행 id로 join해 work_id를 구하고 그 결과를 EXISTS / IN 절에 넣는 대신,
      // 단순히 행을 모두 SELECT한 후 메모리에서 work_id를 다시 조회하는 게 더 일반적이다.
      // 그러나 매 행 N+1 query는 비싸므로, target별로 'SELECT id, work_id 도출 expression'을
      // 한 번에 가져온다.
      const rows = await selectPlaintextRowsForWork(db, target, work.id, orWhere);

      for (const row of rows) {
        checkAbort();
        const updates: Array<[string, string]> = [];
        for (const col of target.columns) {
          const val = row[col];
          if (needsEncryption(val)) {
            updates.push([col, CIPHERTEXT_PREFIX + (await encryptString(workKey, val))]);
          }
        }
        if (updates.length === 0) continue;
        const setSql = updates.map(([c]) => `${c} = ?`).join(', ');
        // foreshadow_link 만 updated_at 컬럼이 없다 — 다른 테이블들과 분기.
        if (target.table === 'foreshadow_link') {
          await db.execute(
            `UPDATE ${target.table} SET ${setSql} WHERE id = ?`,
            [...updates.map(([, v]) => v), row.id as string],
          );
        } else {
          const now = new Date().toISOString();
          await db.execute(
            `UPDATE ${target.table} SET ${setSql}, updated_at = ? WHERE id = ?`,
            [...updates.map(([, v]) => v), now, row.id as string],
          );
        }
        progress.processed += 1;
        onProgress?.({ ...progress });
      }
    }
  }

  progress.currentTable = null;
  onProgress?.({ ...progress });
  return progress;
}

/**
 * 이 work에 평문 컬럼이 하나라도 있는지 빠르게 확인 — 전부 v1: 라면 work_key 신규 생성을 건너뛴다.
 *
 * <p>EXISTS 패턴으로 작성. work 테이블 자기 자신과 자식 테이블 모두를 OR 로 묶어 단일 query.
 */
async function workHasPlaintextRows(
  db: AbstractPowerSyncDatabase,
  workId: string,
  writerId: string,
): Promise<boolean> {
  // work 자체.
  const w = rowsOf<{ n: number }>(
    await db.execute(
      `SELECT COUNT(*) AS n FROM work
       WHERE id = ? AND writer_id = ?
         AND ((title IS NOT NULL AND title != '' AND title NOT LIKE 'v1:%')
           OR (author_name IS NOT NULL AND author_name != '' AND author_name NOT LIKE 'v1:%')
           OR (description IS NOT NULL AND description != '' AND description NOT LIKE 'v1:%'))`,
      [workId, writerId],
    ),
  )[0];
  if ((w?.n ?? 0) > 0) return true;

  // 자식 테이블 — work_id 또는 join 으로 묶어 어디든 평문이 있으면 true.
  for (const target of BACKFILL_TARGETS) {
    const orWhere = target.columns
      .map((c) => `(${c} IS NOT NULL AND ${c} != '' AND ${c} NOT LIKE 'v1:%')`)
      .join(' OR ');
    const rows = await selectPlaintextRowsForWork(db, target, workId, orWhere);
    if (rows.length > 0) return true;
  }
  return false;
}

/**
 * 한 work에 속한 평문 행을 한 번에 SELECT.
 *
 * <p>대부분 테이블은 자체 work_id 컬럼이 있어 `WHERE work_id = ? AND (조건)` 으로 끝난다.
 * 부모 join이 필요한 테이블(character_note, character_custom_field, foreshadow_link)은
 * 명시적 JOIN SQL을 사용한다.
 */
async function selectPlaintextRowsForWork(
  db: AbstractPowerSyncDatabase,
  target: BackfillTarget,
  workId: string,
  orWhere: string,
): Promise<Array<Record<string, unknown> & { id: string }>> {
  const cols = ['id', ...target.columns].join(', ');

  if (target.table === 'character_note') {
    const result = await db.execute(
      `SELECT cn.id AS id, ${target.columns.map((c) => `cn.${c} AS ${c}`).join(', ')}
       FROM character_note cn
       JOIN character c ON c.id = cn.character_id
       WHERE c.work_id = ? AND (${target.columns.map((co) => `cn.${co} IS NOT NULL AND cn.${co} != '' AND cn.${co} NOT LIKE 'v1:%'`).join(' OR ')})`,
      [workId],
    );
    return rowsOf<Record<string, unknown> & { id: string }>(result);
  }

  if (target.table === 'character_custom_field') {
    const result = await db.execute(
      `SELECT ccf.id AS id, ${target.columns.map((c) => `ccf.${c} AS ${c}`).join(', ')}
       FROM character_custom_field ccf
       JOIN character c ON c.id = ccf.character_id
       WHERE c.work_id = ? AND (${target.columns.map((co) => `ccf.${co} IS NOT NULL AND ccf.${co} != '' AND ccf.${co} NOT LIKE 'v1:%'`).join(' OR ')})`,
      [workId],
    );
    return rowsOf<Record<string, unknown> & { id: string }>(result);
  }

  if (target.table === 'foreshadow_link') {
    const result = await db.execute(
      `SELECT fl.id AS id, ${target.columns.map((c) => `fl.${c} AS ${c}`).join(', ')}
       FROM foreshadow_link fl
       JOIN foreshadow f ON f.id = fl.foreshadow_id
       WHERE f.work_id = ? AND (${target.columns.map((co) => `fl.${co} IS NOT NULL AND fl.${co} != '' AND fl.${co} NOT LIKE 'v1:%'`).join(' OR ')})`,
      [workId],
    );
    return rowsOf<Record<string, unknown> & { id: string }>(result);
  }

  // 자체 work_id 컬럼이 있는 케이스 — work, character, episode, plan_note, world_note,
  // plot, foreshadow, idea_archive.
  const result = await db.execute(
    `SELECT ${cols} FROM ${target.table} WHERE work_id = ? AND (${orWhere})`,
    [workId],
  );
  return rowsOf<Record<string, unknown> & { id: string }>(result);
}
