import { describe, expect, it } from 'vitest';
import { parseTipTapContent } from '../tiptap/walker';

const docOf = (content: unknown) => JSON.stringify({ type: 'doc', content });

describe('parseTipTapContent', () => {
  it('null/empty/invalid을 빈 배열로 처리', () => {
    expect(parseTipTapContent(null, { includeAuthorNote: true })).toEqual([]);
    expect(parseTipTapContent('', { includeAuthorNote: true })).toEqual([]);
    expect(parseTipTapContent('not json', { includeAuthorNote: true })).toEqual([]);
  });

  it('paragraph + bold mark 합치기', () => {
    const json = docOf([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: '안녕하세요 ' },
          { type: 'text', text: '세상', marks: [{ type: 'bold' }] },
          { type: 'text', text: '!', marks: [{ type: 'bold' }] },
        ],
      },
    ]);
    const blocks = parseTipTapContent(json, { includeAuthorNote: true });
    expect(blocks).toEqual([
      {
        kind: 'paragraph',
        inlines: [
          { kind: 'run', text: '안녕하세요 ', marks: {} },
          { kind: 'run', text: '세상!', marks: { bold: true } },
        ],
      },
    ]);
  });

  it('sceneBreak atom 노드', () => {
    const json = docOf([{ type: 'sceneBreak' }]);
    const blocks = parseTipTapContent(json, { includeAuthorNote: true });
    expect(blocks).toEqual([{ kind: 'sceneBreak' }]);
  });

  it('AuthorNote는 옵션 OFF 시 제거되어 일반 텍스트로 들어옴', () => {
    const json = docOf([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: '본문 ' },
          { type: 'text', text: '메모', marks: [{ type: 'authorNote' }] },
        ],
      },
    ]);
    const blocks = parseTipTapContent(json, { includeAuthorNote: false });
    // mark이 제거되면 두 run이 같은 marks(empty)로 합쳐짐
    expect(blocks).toEqual([
      {
        kind: 'paragraph',
        inlines: [{ kind: 'run', text: '본문 메모', marks: {} }],
      },
    ]);
  });

  it('heading 레벨/textAlign attr', () => {
    const json = docOf([
      {
        type: 'heading',
        attrs: { level: 2, textAlign: 'center' },
        content: [{ type: 'text', text: '제목' }],
      },
    ]);
    const blocks = parseTipTapContent(json, { includeAuthorNote: true });
    expect(blocks).toEqual([
      {
        kind: 'heading',
        level: 2,
        align: 'center',
        inlines: [{ kind: 'run', text: '제목', marks: {} }],
      },
    ]);
  });

  it('bulletList → list block', () => {
    const json = docOf([
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'A' }] },
            ],
          },
          {
            type: 'listItem',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'B' }] },
            ],
          },
        ],
      },
    ]);
    const blocks = parseTipTapContent(json, { includeAuthorNote: true });
    expect(blocks[0]).toMatchObject({ kind: 'list', ordered: false });
  });

  it('textStyle marks(color/fontSize) 흡수', () => {
    const json = docOf([
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: '빨강',
            marks: [
              {
                type: 'textStyle',
                attrs: { color: '#ff0000', fontSize: '14pt' },
              },
            ],
          },
        ],
      },
    ]);
    const blocks = parseTipTapContent(json, { includeAuthorNote: true });
    expect(blocks).toEqual([
      {
        kind: 'paragraph',
        inlines: [
          {
            kind: 'run',
            text: '빨강',
            marks: { color: '#ff0000', fontSize: '14pt' },
          },
        ],
      },
    ]);
  });
});
