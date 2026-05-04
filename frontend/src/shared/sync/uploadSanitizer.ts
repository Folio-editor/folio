/**
 * Plan C 결정 23 — PowerSync uploadData 큐 sanitize.
 *
 * <p>게스트 모드에서 KEK 없이 적재된 평문 PUT/PATCH op이 ps_crud 큐에 잔존하면,
 * OAuth 로그인 후 PowerSync connect 시 평문 그대로 서버로 전송되어 Postgres에
 * 평문 INSERT가 한 번 실행된다(이후 백필 PATCH로 ciphertext 덮어쓰기되더라도 WAL에
 * 평문 영구 기록). 본 모듈은 connector.uploadData가 batch.crud를 서버로 보내기
 * 직전, 큐 entry의 평문 컬럼을 KEK으로 ciphertext 교체한다.
 *
 * <p>설계 원칙:
 * <ul>
 *   <li>멱등 — 이미 'v1:' 접두사 컬럼은 needsEncryption 가드로 skip</li>
 *   <li>폴백 — KEK 없으면 (게스트/PepperProvider 비활성) 즉시 no-op</li>
 *   <li>격리 — 개별 op 실패 시 그 entry만 평문 통과(현재 폴백 동등), 전체 batch 차단 X</li>
 *   <li>보강 — work 자체 PUT은 encrypted_dek 컬럼도 SQLite에서 보강해 다른 디바이스 호환</li>
 * </ul>
 *
 * <p>backfill.ts 의 BACKFILL_TARGETS 와 1:1 매핑된다 (저장 측 = SQLite, 본 모듈 = 큐 측).
 */

import type { AbstractPowerSyncDatabase, CrudBatch } from '@powersync/web';
import { encryptString } from '../crypto/cipher';
import { getCurrentKek } from '../crypto/lifecycle';
import { ensureWorkKey } from '../crypto/workKey';

const CIPHERTEXT_PREFIX = 'v1:';

/** sanitize 대상 — 테이블별 암호화 컬럼. backfill.ts의 BACKFILL_TARGETS 와 동일. */
const SANITIZE_TARGETS: Record<string, readonly string[]> = {
  work: ['title', 'author_name', 'description'],
  episode: ['title', 'content'],
  plot: ['title', 'content'],
  plan_note: ['title', 'content'],
  world_note: ['name', 'content'],
  character: ['name', 'age'],
  character_note: ['title', 'content'],
  character_custom_field: ['field_name', 'field_value'],
  foreshadow: ['title', 'content'],
  foreshadow_link: ['context_memo'],
  idea_archive: ['content'],
};

function needsEncryption(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !value.startsWith(CIPHERTEXT_PREFIX)
  );
}

interface SanitizableOp {
  table: string;
  id: string;
  op: string;
  opData: Record<string, unknown> | null;
}

/**
 * batch.crud 의 각 op를 in-place sanitize.
 *
 * <ul>
 *   <li>KEK 없으면 전체 no-op (현재 폴백 정책 유지)</li>
 *   <li>DELETE op (opData=null) skip</li>
 *   <li>이미 'v1:' 인 컬럼 skip (멱등)</li>
 *   <li>work_id 보강이 필요한 테이블은 SQLite SELECT로 해결</li>
 *   <li>work 자체 PUT은 encrypted_dek 컬럼도 보강</li>
 * </ul>
 */
export async function sanitizeCrudBatch(
  db: AbstractPowerSyncDatabase,
  batch: CrudBatch,
): Promise<void> {
  const kek = getCurrentKek();
  if (!kek) return;

  for (const entry of batch.crud) {
    const op: SanitizableOp = {
      table: entry.table,
      id: entry.id,
      op: String(entry.op),
      opData: (entry.opData as Record<string, unknown> | null | undefined) ?? null,
    };
    if (op.op === 'DELETE') continue;
    const columns = SANITIZE_TARGETS[op.table];
    if (!columns) continue;
    if (!op.opData || typeof op.opData !== 'object') continue;

    try {
      await sanitizeOne(db, kek, op, columns);
    } catch (e) {
      // 개별 op 실패 — 그 entry만 평문 통과(현재 폴백 동등), 전체 batch 막지 않음.
      // PowerSync 재시도 사이클로 다음에 다시 시도되며, 멱등이라 안전.
      console.warn(
        `[sanitize] entry 실패 — table=${op.table} id=${op.id} op=${op.op}:`,
        e,
      );
    }
  }
}

async function sanitizeOne(
  db: AbstractPowerSyncDatabase,
  kek: CryptoKey,
  op: SanitizableOp,
  columns: readonly string[],
): Promise<void> {
  const data = op.opData!;

  // 1) 평문 컬럼이 하나라도 있는지 빠르게 체크 — 없으면 즉시 return (멱등 + 정상 모드 fast path).
  const plaintextCols = columns.filter((c) => needsEncryption(data[c]));
  if (plaintextCols.length === 0) {
    // 평문 컬럼이 없어도 work PUT의 encrypted_dek 보강은 별도로 시도해야 함 (게스트 시절
    // INSERT가 encrypted_dek 누락한 채로 큐에 들어있을 수 있음).
    if (op.table === 'work' && op.op === 'PUT') {
      await ensureWorkEncryptedDek(db, op.id, data);
    }
    return;
  }

  // 2) work_id 해석.
  const workId = await resolveWorkId(db, op.table, data, op.id);
  if (!workId) {
    console.warn(`[sanitize] work_id 해석 실패 — skip: table=${op.table} id=${op.id}`);
    return;
  }

  // 3) work_key 확보 — backfill.ts와 동일 패턴. SQLite 의 work.encrypted_dek 사용.
  //    백필이 이미 채웠을 가능성 높음. 없으면 신규 생성 + 저장(saveEncryptedDek).
  const workKey = await ensureWorkKey({
    kek,
    workId,
    loadEncryptedDek: async () => {
      const r = await db.execute(
        'SELECT encrypted_dek FROM work WHERE id = ? LIMIT 1',
        [workId],
      );
      const row = (r.rows?._array as { encrypted_dek: string | null }[] | undefined)?.[0];
      return row?.encrypted_dek ?? null;
    },
    saveEncryptedDek: async (b64) => {
      const now = new Date().toISOString();
      await db.execute(
        'UPDATE work SET encrypted_dek = ?, updated_at = ? WHERE id = ?',
        [b64, now, workId],
      );
    },
  });

  // 4) 평문 컬럼 in-place 암호화.
  for (const col of plaintextCols) {
    const ct = await encryptString(workKey, data[col] as string);
    data[col] = CIPHERTEXT_PREFIX + ct;
  }

  // 5) work 자체 PUT 시 encrypted_dek 보강 — 부작용 1번 대응.
  if (op.table === 'work' && op.op === 'PUT') {
    await ensureWorkEncryptedDek(db, op.id, data);
  }
}

/**
 * work PUT op의 opData에 encrypted_dek 가 비어있으면 SQLite 에서 보강.
 *
 * <p>게스트 시절 createWork()는 INSERT 시 encrypted_dek 컬럼을 명시적으로 누락 →
 * ps_crud 의 PUT entry 에도 encrypted_dek 없음 → 그대로 서버 INSERT 시 NULL → 다른
 * 디바이스에서 work_key 못 풀음. SQLite의 work.encrypted_dek 는 백필 또는 sanitizeOne 의
 * ensureWorkKey 에서 이미 채워졌을 가능성 높음.
 */
async function ensureWorkEncryptedDek(
  db: AbstractPowerSyncDatabase,
  workId: string,
  data: Record<string, unknown>,
): Promise<void> {
  if (data.encrypted_dek) return;
  const r = await db.execute(
    'SELECT encrypted_dek FROM work WHERE id = ? LIMIT 1',
    [workId],
  );
  const dek = (r.rows?._array as { encrypted_dek: string | null }[] | undefined)?.[0]
    ?.encrypted_dek;
  if (dek) {
    data.encrypted_dek = dek;
  }
}

/**
 * 테이블별 work_id 해석.
 *
 * <ul>
 *   <li>work 자체 — id가 곧 work_id</li>
 *   <li>op.opData 에 직접 work_id 컬럼이 있는 케이스 (PUT op 대부분) — 그대로 사용</li>
 *   <li>PATCH 등으로 work_id 미포함 시 SQLite SELECT 보강 (테이블별 join 또는 자체 컬럼)</li>
 * </ul>
 */
async function resolveWorkId(
  db: AbstractPowerSyncDatabase,
  table: string,
  data: Record<string, unknown>,
  id: string,
): Promise<string | null> {
  if (table === 'work') return id;
  if (typeof data.work_id === 'string') return data.work_id;

  if (table === 'character_note') {
    const r = await db.execute(
      'SELECT c.work_id AS work_id FROM character_note cn JOIN character c ON c.id = cn.character_id WHERE cn.id = ? LIMIT 1',
      [id],
    );
    return ((r.rows?._array as { work_id: string }[] | undefined)?.[0]?.work_id) ?? null;
  }
  if (table === 'character_custom_field') {
    const r = await db.execute(
      'SELECT c.work_id AS work_id FROM character_custom_field ccf JOIN character c ON c.id = ccf.character_id WHERE ccf.id = ? LIMIT 1',
      [id],
    );
    return ((r.rows?._array as { work_id: string }[] | undefined)?.[0]?.work_id) ?? null;
  }
  if (table === 'foreshadow_link') {
    const r = await db.execute(
      'SELECT f.work_id AS work_id FROM foreshadow_link fl JOIN foreshadow f ON f.id = fl.foreshadow_id WHERE fl.id = ? LIMIT 1',
      [id],
    );
    return ((r.rows?._array as { work_id: string }[] | undefined)?.[0]?.work_id) ?? null;
  }
  // 자체 work_id 컬럼이 있는 케이스 — episode/plot/character/plan_note/world_note/foreshadow/idea_archive
  const r = await db.execute(
    `SELECT work_id FROM ${table} WHERE id = ? LIMIT 1`,
    [id],
  );
  return ((r.rows?._array as { work_id: string }[] | undefined)?.[0]?.work_id) ?? null;
}
