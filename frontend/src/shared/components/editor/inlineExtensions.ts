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
import Highlight from './extensions/CustomHighlight';
import Typography from '@tiptap/extension-typography';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import Color from '@tiptap/extension-color';
import { TextStyle, FontFamily, FontSize } from '@tiptap/extension-text-style';
import AuthorNote from './extensions/AuthorNote';
import FindReplace from './extensions/FindReplace';
import SceneBreak from './extensions/SceneBreak';
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
 *
 * 노드 타입(SceneBreak/AuthorNote)은 반드시 포함 — 메인 ContentEditor 가 저장한 episode
 * 본문 JSON 에 이런 노드가 들어 있으면 TipTap v3 의 strict content check 가
 * 알 수 없는 노드를 발견했을 때 doc 전체를 빈 paragraph 로 떨어뜨려 본문이 비어 보임.
 * 데코레이션 전용 (ReviewHighlight/SpellcheckHighlight/TypewriterMode/FocusMode) 과
 * 입력 룰만 가진 (KoreanPunctuation/AutoPairQuotes/TabIndent) 은 인라인 환경에서 불필요.
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
    SceneBreak,
    FindReplace,
  ];
}
