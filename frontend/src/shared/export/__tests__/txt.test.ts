import { describe, expect, it } from 'vitest';
import { blocksToTxt } from '../formatters/txt';

describe('blocksToTxt', () => {
  it('단일 paragraph는 본문 + 줄바꿈', () => {
    const txt = blocksToTxt([
      {
        kind: 'paragraph',
        inlines: [{ kind: 'run', text: '한 줄.', marks: {} }],
      },
    ]);
    expect(txt).toBe('한 줄.\n');
  });

  it('sceneBreak은 * * *', () => {
    const txt = blocksToTxt([
      {
        kind: 'paragraph',
        inlines: [{ kind: 'run', text: 'A', marks: {} }],
      },
      { kind: 'sceneBreak' },
      {
        kind: 'paragraph',
        inlines: [{ kind: 'run', text: 'B', marks: {} }],
      },
    ]);
    expect(txt).toBe('A\n\n* * *\n\nB\n');
  });

  it('heading은 # prefix', () => {
    const txt = blocksToTxt([
      {
        kind: 'heading',
        level: 2,
        inlines: [{ kind: 'run', text: '제목', marks: {} }],
      },
    ]);
    expect(txt).toBe('## 제목\n');
  });

  it('bullet list 마커', () => {
    const txt = blocksToTxt([
      {
        kind: 'list',
        ordered: false,
        items: [
          [
            {
              kind: 'paragraph',
              inlines: [{ kind: 'run', text: 'A', marks: {} }],
            },
          ],
          [
            {
              kind: 'paragraph',
              inlines: [{ kind: 'run', text: 'B', marks: {} }],
            },
          ],
        ],
      },
    ]);
    expect(txt).toContain('• A');
    expect(txt).toContain('• B');
  });

  it('hardBreak는 한 줄 내 줄바꿈', () => {
    const txt = blocksToTxt([
      {
        kind: 'paragraph',
        inlines: [
          { kind: 'run', text: '1행', marks: {} },
          { kind: 'br' },
          { kind: 'run', text: '2행', marks: {} },
        ],
      },
    ]);
    expect(txt).toBe('1행\n2행\n');
  });
});
