import { describe, expect, it } from 'vitest';
import { sanitizeFileName } from '../fileName';

describe('sanitizeFileName', () => {
  it('null/empty → untitled', () => {
    expect(sanitizeFileName(null)).toBe('untitled');
    expect(sanitizeFileName('')).toBe('untitled');
    expect(sanitizeFileName('   ')).toBe('untitled');
  });

  it('Windows 금지문자 제거', () => {
    expect(sanitizeFileName('a<b>c:d"e/f\\g|h?i*j')).toBe('abcdefghij');
  });

  it('한글/이모지/하이픈 보존', () => {
    expect(sanitizeFileName('내 작품-제목 🎨')).toBe('내 작품-제목 🎨');
  });

  it('연속 공백 압축', () => {
    expect(sanitizeFileName('a   b  c')).toBe('a b c');
  });

  it('Windows 예약어 prefix', () => {
    expect(sanitizeFileName('CON')).toBe('_CON');
    expect(sanitizeFileName('com1')).toBe('_com1');
  });

  it('200자 trim', () => {
    const long = 'x'.repeat(300);
    expect(sanitizeFileName(long).length).toBe(200);
  });

  it('양 끝 점/공백 제거', () => {
    expect(sanitizeFileName('  ...hello...  ')).toBe('hello');
  });
});
