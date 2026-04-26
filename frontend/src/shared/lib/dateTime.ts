/**
 * 백엔드/PowerSync는 LocalDateTime을 ISO 8601 naive 형식("2026-04-24T13:00:00")으로 직렬화한다.
 * 자바스크립트 Date는 timezone marker가 없으면 로컬 시간으로 해석하므로,
 * 한국 시간대(KST=UTC+9)에서는 9시간만큼 차이가 생긴다.
 *
 * 이 헬퍼는 timezone marker(Z 또는 ±HH:MM)가 누락된 경우 UTC로 간주해 보정한다.
 */
export function parseServerDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const normalized = /[Zz]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}
