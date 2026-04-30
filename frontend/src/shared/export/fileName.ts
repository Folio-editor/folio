// ============================================================
// 파일명 안전화
// ============================================================
// Windows/macOS/Linux 공통 금지문자, 제어문자, 양끝 공백/점을 제거한다.
// 한글·이모지는 보존한다(모든 OS가 UTF-8 파일명 허용).
// ============================================================

// Windows 금지문자 + 제어문자(0x00~0x1F). 공백·하이픈은 보존.
// eslint-disable-next-line no-control-regex
const FORBIDDEN = /[<>:"/\\|?*\x00-\x1F]/g;
const TRAILING_DOTS_OR_SPACES = /[. ]+$/;
const LEADING_DOTS_OR_SPACES = /^[. ]+/;

/** Windows 예약어 — 대소문자 무관, 확장자가 붙어도 거부됨 */
const RESERVED = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

const MAX_LENGTH = 200;

/**
 * 사용자 입력(작품명 등)을 안전한 파일명으로 변환한다.
 * 결과가 비어 있으면 'untitled'을 반환한다.
 *
 * 확장자(.txt, .docx, .pdf)는 호출처에서 별도로 붙인다.
 */
export function sanitizeFileName(input: string | null | undefined): string {
  if (!input) return 'untitled';
  let name = String(input)
    .replace(FORBIDDEN, '')
    .replace(LEADING_DOTS_OR_SPACES, '')
    .replace(TRAILING_DOTS_OR_SPACES, '')
    .trim();

  // 연속 공백을 1칸으로 압축
  name = name.replace(/\s+/g, ' ');

  if (RESERVED.has(name.toUpperCase())) {
    name = `_${name}`;
  }
  if (name.length > MAX_LENGTH) {
    name = name.slice(0, MAX_LENGTH);
  }
  return name || 'untitled';
}
