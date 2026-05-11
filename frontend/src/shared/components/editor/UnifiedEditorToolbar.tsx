import { useEffect, useReducer, useRef } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  MessageSquareText,
  Undo2,
  Redo2,
  Search,
  HelpCircle,
  Settings,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { useFocusedEditor } from '../../stores/focusedEditorStore';
import { useEditorToolbarStore } from '../../stores/editorToolbarStore';
import { HighlightColorPalette } from './HighlightColorPalette';
import { TextColorPalette } from './TextColorPalette';
import { FontFamilyDropdown } from './FontFamilyDropdown';
import { FontSizeDropdown } from './FontSizeDropdown';
import { useHorizontalWheelScroll } from '../../hooks/useHorizontalWheelScroll';

interface UnifiedEditorToolbarProps {
  /** single: props.editor 사용 (단일 ContentEditor 화면)
   *  shared: focusedEditorStore + editorToolbarStore.visible 사용 (다중 인라인 에디터) */
  mode: 'single' | 'shared';
  editor?: Editor | null;
  onToggleFindReplace?: () => void;
  onToggleShortcutHelp?: () => void;
  onToggleSettings?: () => void;
}

const ICON = 15;

function Sep() {
  return <div className="mx-1 h-4 w-px bg-border" />;
}

function Btn({
  active,
  onClick,
  title,
  disabled,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cn(
        'h-7 w-7 shrink-0 rounded flex items-center justify-center text-muted-foreground transition-colors',
        !disabled && 'hover:bg-accent hover:text-accent-foreground',
        active && !disabled && 'bg-accent text-accent-foreground',
        disabled && 'opacity-40 cursor-default',
      )}
    >
      {children}
    </button>
  );
}

function useForce(editor: Editor | null) {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!editor) return;
    editor.on('transaction', force);
    return () => {
      editor.off('transaction', force);
    };
  }, [editor]);
}

/**
 * 모든 에디터 화면이 공유하는 통일된 툴바.
 *
 * mode='single' — props.editor 직접 사용 (Episode/Plot 회차/Foreshadow/Plan/Idea 단일 ContentEditor)
 * mode='shared' — focusedEditorStore 의 마지막 포커스 에디터 사용 (CharacterOverview / PlotOverview / WorldNote 계층 등 다중 인라인)
 *
 * 버튼 셋: 마크다운/단축키 가능한 헤딩·리스트·인용·장면전환은 제거.
 *  - 굵게/기울임/밑줄/취소선
 *  - 형광펜(8색 팔레트) / 글자색 팔레트
 *  - 글꼴 / 글자 크기
 *  - 정렬 좌/중/우
 *  - 링크 / 주석
 *  - 되돌리기 / 다시 실행
 *  - 우측: 찾기, 도움말, 설정
 */
export function UnifiedEditorToolbar({
  mode,
  editor: propEditor,
  onToggleFindReplace,
  onToggleShortcutHelp,
  onToggleSettings,
}: UnifiedEditorToolbarProps) {
  const sharedEditor = useFocusedEditor();
  const sharedVisible = useEditorToolbarStore((s) => s.visible);
  const editor = mode === 'single' ? propEditor ?? null : sharedEditor;
  useForce(editor);
  const scrollerRef = useRef<HTMLDivElement>(null);
  useHorizontalWheelScroll(scrollerRef);

  if (mode === 'shared' && !sharedVisible) return null;

  const disabled = !editor;
  const isActive = (name: string, attrs?: Record<string, unknown>): boolean => {
    if (!editor) return false;
    return attrs ? editor.isActive(name, attrs) : editor.isActive(name);
  };
  const c = () => editor!.chain().focus();

  // overflow-x-auto + scrollbar-none + 휠 매핑: 시각적 스크롤바 숨김 + 마우스 휠로 가로 스크롤
  // justify-start + min-w-max(내부): 폭 부족 시 버튼이 양끝으로 늘어나지 않고 자연 폭 유지
  const containerClass =
    mode === 'shared'
      ? 'sticky top-0 z-20 flex h-9 items-center overflow-x-auto scrollbar-none border-b border-border bg-background'
      : 'flex h-9 items-center overflow-x-auto scrollbar-none border-b border-border bg-background';

  return (
    <div ref={scrollerRef} className={containerClass}>
      <div className="flex h-full min-w-max items-center gap-0.5 px-2">
      {/* Text formatting */}
      <Btn
        disabled={disabled}
        active={isActive('bold')}
        onClick={() => !disabled && c().toggleBold().run()}
        title="굵게 (Ctrl+B)"
      >
        <Bold size={ICON} />
      </Btn>
      <Btn
        disabled={disabled}
        active={isActive('italic')}
        onClick={() => !disabled && c().toggleItalic().run()}
        title="기울임 (Ctrl+I)"
      >
        <Italic size={ICON} />
      </Btn>
      <Btn
        disabled={disabled}
        active={isActive('underline')}
        onClick={() => !disabled && c().toggleUnderline().run()}
        title="밑줄 (Ctrl+U)"
      >
        <Underline size={ICON} />
      </Btn>
      <Btn
        disabled={disabled}
        active={isActive('strike')}
        onClick={() => !disabled && c().toggleStrike().run()}
        title="취소선 (Ctrl+Shift+X)"
      >
        <Strikethrough size={ICON} />
      </Btn>

      <Sep />

      {/* Highlight + color palette + font + size */}
      {editor && (
        <>
          <HighlightColorPalette editor={editor} />
          <TextColorPalette editor={editor} />
          <FontFamilyDropdown editor={editor} />
          <FontSizeDropdown editor={editor} />
        </>
      )}

      <Sep />

      {/* Align */}
      <Btn
        disabled={disabled}
        active={isActive({ textAlign: 'left' } as Record<string, unknown>)}
        onClick={() => !disabled && (c() as any).setTextAlign('left').run()}
        title="왼쪽 정렬"
      >
        <AlignLeft size={ICON} />
      </Btn>
      <Btn
        disabled={disabled}
        active={isActive({ textAlign: 'center' } as Record<string, unknown>)}
        onClick={() => !disabled && (c() as any).setTextAlign('center').run()}
        title="가운데 정렬"
      >
        <AlignCenter size={ICON} />
      </Btn>
      <Btn
        disabled={disabled}
        active={isActive({ textAlign: 'right' } as Record<string, unknown>)}
        onClick={() => !disabled && (c() as any).setTextAlign('right').run()}
        title="오른쪽 정렬"
      >
        <AlignRight size={ICON} />
      </Btn>

      <Sep />

      {/* Author note (주석) */}
      <Btn
        disabled={disabled}
        active={isActive('authorNote')}
        onClick={() => !disabled && (c() as any).toggleAuthorNote().run()}
        title="주석 (Ctrl+Shift+M)"
      >
        <MessageSquareText size={ICON} />
      </Btn>

      <Sep />

      {/* History */}
      <Btn
        disabled={disabled}
        onClick={() => !disabled && c().undo().run()}
        title="되돌리기 (Ctrl+Z)"
      >
        <Undo2 size={ICON} />
      </Btn>
      <Btn
        disabled={disabled}
        onClick={() => !disabled && c().redo().run()}
        title="다시 실행 (Ctrl+Shift+Z)"
      >
        <Redo2 size={ICON} />
      </Btn>

      <Sep />

      {/* 유틸리티 그룹 (찾기 / 도움말 / 설정) — 폭 충분 시 우측 정렬, 부족 시 자연 위치 */}
      {onToggleFindReplace && (
        <Btn onClick={onToggleFindReplace} title="찾기/바꾸기 (Ctrl+F)">
          <Search size={ICON} />
        </Btn>
      )}
      {onToggleShortcutHelp && (
        <Btn onClick={onToggleShortcutHelp} title="단축키 / 마크다운 안내 (F1)">
          <HelpCircle size={ICON} />
        </Btn>
      )}
      {onToggleSettings && (
        <Btn onClick={onToggleSettings} title="설정">
          <Settings size={ICON} />
        </Btn>
      )}
      </div>
    </div>
  );
}
