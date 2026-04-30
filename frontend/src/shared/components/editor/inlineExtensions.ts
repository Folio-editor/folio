// ============================================================
// 인라인 에디터 공통 Extension Preset
// ============================================================
// UnifiedEditorToolbar(mode='shared')와 호환을 보장하기 위한 표준 셋.
// 툴바 버튼 일체(굵게/기울임/밑줄/취소선/형광펜/글자색/폰트/크기/정렬/주석/되돌리기)가
// 모두 silent fail 없이 동작하도록 필요한 extension을 모두 포함한다.
//
// 이 preset은 다음 곳에서 사용된다:
//   - WorldNoteInlineEditor
//   - PlotOverview의 자체 useEditor (막/회차)
//   - CharacterOverview의 InlineNoteItem
// ============================================================

import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Typography from '@tiptap/extension-typography';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import Color from '@tiptap/extension-color';
import { TextStyle, FontFamily, FontSize } from '@tiptap/extension-text-style';
import AuthorNote from './extensions/AuthorNote';
import FindReplace from './extensions/FindReplace';
import type { Extensions } from '@tiptap/react';

export interface InlineExtensionsOptions {
  placeholder?: string;
}

/**
 * 인라인 에디터용 표준 extension 셋.
 * 툴바와 100% 호환되도록 textStyle 계열(Color/FontFamily/FontSize), TextAlign,
 * AuthorNote, Highlight를 모두 포함한다.
 *
 * Underline 은 StarterKit v3.x 부터 기본 포함이므로 별도 등록 시 'Duplicate extension names' 경고.
 * SceneBreak/CharacterCount/FindReplace/ReviewHighlight 등 본문 전용 또는 데코레이션
 * 전용 extension은 인라인 환경에 부적절하므로 제외한다(메인 ContentEditor에만 등록).
 */
export function createInlineExtensions(
  options: InlineExtensionsOptions = {},
): Extensions {
  return [
    StarterKit.configure({ code: false, codeBlock: false }),
    Placeholder.configure({
      placeholder: options.placeholder ?? '내용을 입력하세요…',
    }),
    Highlight.configure({ multicolor: true }),
    Typography,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TextStyle,
    Color.configure({ types: ['textStyle'] }),
    FontFamily.configure({ types: ['textStyle'] }),
    FontSize.configure({ types: ['textStyle'] }),
    AuthorNote,
    FindReplace,
  ];
}
