/**
 * server_encrypted_dek 발급 헬퍼 (Vault Transit envelope encryption).
 *
 * <p>흐름:
 * <ol>
 *   <li>신규 work_key 가 생성되면 ensureWorkKey 의 onCreated 콜백에서 issueServerDek(workId, raw) 호출</li>
 *   <li>온라인 + 인증 OK → 백엔드 POST /works/server-dek → Vault wrap → DB 저장</li>
 *   <li>오프라인·실패 → localStorage pending queue 적재. retryPendingServerDeks() 가
 *       앱 부팅·온라인 복귀 시 일괄 재시도</li>
 * </ol>
 *
 * <p>raw work_key 는 base64 인코딩 후 즉시 폐기. pending queue 에는 base64 형태로
 * 임시 저장 (알파 단계 — IndexedDB safeStorage 화는 V-8 후속). 온라인 복귀 즉시 폐기.
 *
 * <p>curious-wiggling-thacker plan V-5.
 */

import { apiClient, ApiError } from '../lib/apiClient';

const PENDING_KEY = 'folio.serverDek.pending.v1';

interface PendingEntry {
  workId: string;
  rawWorkKeyB64: string;  // 32B base64
  createdAt: string;
}

function readPending(): PendingEntry[] {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PendingEntry[];
  } catch {
    return [];
  }
}

function writePending(entries: PendingEntry[]): void {
  if (entries.length === 0) {
    localStorage.removeItem(PENDING_KEY);
  } else {
    localStorage.setItem(PENDING_KEY, JSON.stringify(entries));
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function callIssue(workId: string, rawWorkKeyB64: string): Promise<void> {
  await apiClient.post('/works/server-dek', { workId, rawWorkKey: rawWorkKeyB64 });
}

/**
 * 신규 raw work_key 를 server-dek pending queue 에만 적재.
 *
 * 호출 시점: sanitizeCrudBatch 안의 ensureWorkKey 신규 생성 분기 (onCreated hook).
 * 이 시점은 PowerSync 가 work 행을 서버에 보내기 직전 같은 batch 내부 → 즉시 호출하면
 * backend 에 work 없어 409. backoff 동기 await 도 같은 batch 안이라 데드락.
 *
 * 따라서 즉시 발급 호출 안 함 → pending 만 적재 → connector.uploadData 의
 * batch.complete() 직후 retryPendingServerDeks 가 backend 호출 (work 도달 보장).
 */
export async function issueServerDek(
  workId: string,
  rawWorkKey: Uint8Array,
): Promise<void> {
  const b64 = bytesToBase64(rawWorkKey);
  const entries = readPending();
  if (!entries.some((p) => p.workId === workId)) {
    entries.push({ workId, rawWorkKeyB64: b64, createdAt: new Date().toISOString() });
    writePending(entries);
  }
}

/**
 * 부팅·온라인 복귀 시 호출. pending 항목 일괄 발급 시도.
 * 성공한 항목은 queue 에서 제거.
 */
export async function retryPendingServerDeks(): Promise<{ ok: number; failed: number }> {
  const pending = readPending();
  if (pending.length === 0) return { ok: 0, failed: 0 };

  const remaining: PendingEntry[] = [];
  let ok = 0;
  let failed = 0;
  for (const entry of pending) {
    try {
      await callIssue(entry.workId, entry.rawWorkKeyB64);
      ok++;
    } catch (e) {
      if (e instanceof ApiError && (e.status === 403 || e.status === 404)) {
        // 403: writer 불일치 / 404: 작품 삭제 — 재시도 무의미, queue 제거
        ok++;
      } else {
        // 401 (인증 race) · 409 (sync 대기) · 5xx · 네트워크 → queue 유지하여 다음 trigger 시 재시도
        remaining.push(entry);
        failed++;
      }
    }
  }
  writePending(remaining);
  return { ok, failed };
}

/**
 * 로그아웃·계정 전환 시 호출. raw work_key 가 담긴 pending queue 를 비운다.
 */
export function clearPendingServerDeks(): void {
  localStorage.removeItem(PENDING_KEY);
}
