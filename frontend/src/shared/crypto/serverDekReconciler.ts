/**
 * server_encrypted_dek 자동 보강 reconciler.
 *
 * 트리거 시점:
 *   - 앱 부팅 후 sync 완료
 *   - 온라인 복귀 후 sync 완료
 *   - PowerSync uploadData 의 work PUT 직후
 *
 * 동작:
 *   1. SQLite 의 work 중 encrypted_dek IS NOT NULL AND server_encrypted_dek IS NULL 인 행 SELECT
 *   2. 각 work 마다 KEK 으로 encrypted_dek unwrap → raw work_key 획득
 *   3. issueServerDek(workId, raw) 호출 → backend Vault wrap → server_encrypted_dek 채움
 *   4. PowerSync 가 서버 변경 sync 다운 → 클라 SQLite 의 server_encrypted_dek 도 채워짐
 *
 * 어떤 경로 (게스트→로그인 backfill, 오프라인→온라인, 이미 만든 stale 작품) 든
 * server_encrypted_dek=NULL 인 work 가 보이면 자동 보강. 사용자 수동 작업 0.
 */

import { db } from '../sync/db';
import { decryptBytes } from './cipher';
import { getCurrentKek } from './lifecycle';
import { issueServerDek } from './serverDek';

interface MissingDekRow {
  id: string;
  encrypted_dek: string;
}

let inflight = false;

export async function reconcileMissingServerDeks(): Promise<{ ok: number; failed: number }> {
  if (inflight) return { ok: 0, failed: 0 };
  const kek = getCurrentKek();
  if (!kek) return { ok: 0, failed: 0 }; // 게스트 모드 → unwrap 불가, skip

  inflight = true;
  let ok = 0;
  let failed = 0;
  try {
    const rows = await db.execute(
      `SELECT id, encrypted_dek FROM work
       WHERE encrypted_dek IS NOT NULL
         AND (server_encrypted_dek IS NULL OR server_encrypted_dek = '')`,
    );
    const list = (rows.rows?._array ?? []) as MissingDekRow[];
    if (list.length === 0) return { ok: 0, failed: 0 };

    for (const row of list) {
      try {
        const raw = await decryptBytes(kek, row.encrypted_dek);
        try {
          await issueServerDek(row.id, raw);
          ok++;
        } finally {
          // raw 메모리 즉시 폐기
          raw.fill(0);
        }
      } catch (e) {
        console.warn('[serverDek/reconciler] work', row.id, '복호화 실패:', e);
        failed++;
      }
    }
    return { ok, failed };
  } finally {
    inflight = false;
  }
}
