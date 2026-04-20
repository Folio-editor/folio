import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Typography from '@tiptap/extension-typography';
import CharacterCount from '@tiptap/extension-character-count';
import TextAlign from '@tiptap/extension-text-align';
import Color from '@tiptap/extension-color';
import TextStyle from '@tiptap/extension-color';
import Link from '@tiptap/extension-link';
import { cn } from '../../lib/cn';
import { useEditorSettings } from '../../stores/editorSettingsStore';
import SceneBreak from './extensions/SceneBreak';
import KoreanPunctuation from './extensions/KoreanPunctuation';
import AutoPairQuotes from './extensions/AutoPairQuotes';
import AuthorNote from './extensions/AuthorNote';
import TypewriterMode from './extensions/TypewriterMode';
import FocusMode from './extensions/FocusMode';
import FindReplace from './extensions/FindReplace';
import EditorToolbar from './EditorToolbar';
import EditorBubbleMenu from './EditorBubbleMenu';
import EditorStatusBar from './EditorStatusBar';
import EditorSettingsPanel from './EditorSettingsPanel';
import EditorFindReplace from './EditorFindReplace';
import EditorShortcutHelp from './EditorShortcutHelp';

interface ContentEditorProps {
  itemId: string;
  initialContent: string | null;
  placeholder?: string;
  onUpdate: (json: string) => void;
  debounceMs?: number;
  className?: string;
  showStatusBar?: boolean;
  onCharCountChange?: (count: number) => void;
}

const DEFAULT_DEBOUNCE_MS = 1000;

export function ContentEditor({
  itemId,
  initialContent,
  placeholder = '내용을 작성하세요…',
  onUpdate,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  className,
  showStatusBar = true,
  onCharCountChange,
}: ContentEditorProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onUpdateRef = useRef(onUpdate);
  const onCharCountChangeRef = useRef(onCharCountChange);
  onUpdateRef.current = onUpdate;
  onCharCountChangeRef.current = onCharCountChange;

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [charCount, setCharCount] = useState(0);
  const [wordCount, setWordCount] = useState(0);
  const [sessionStartChars, setSessionStartChars] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);

  const settings = useEditorSettings();

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({
          code: false,
          codeBlock: false,
        }),
        Placeholder.configure({ placeholder }),
        Underline,
        Highlight.configure({ multicolor: false }),
        Typography,
        CharacterCount,
        TextAlign.configure({ types: ['heading', 'paragraph'] }),
        Color,
        Link.configure({ openOnClick: false }),
        SceneBreak,
        KoreanPunctuation.configure({ enabled: settings.autoKoreanPunctuation }),
        AutoPairQuotes.configure({ enabled: settings.autoPairQuotes }),
        AuthorNote,
        TypewriterMode.configure({
          enabled: settings.typewriterMode,
          position: settings.typewriterPosition,
        }),
        FocusMode.configure({ enabled: settings.focusMode }),
        FindReplace,
      ],
      content: parseContent(initialContent),
      onUpdate: ({ editor: ed }) => {
        setSaveStatus('saving');

        // 글자 수 즉시 갱신 (debounce 없이)
        const chars = ed.storage.characterCount?.characters?.() ?? 0;
        const words = ed.storage.characterCount?.words?.() ?? 0;
        setCharCount(chars);
        setWordCount(words);
        if (onCharCountChangeRef.current) onCharCountChangeRef.current(chars);

        const emit = () => {
          const json = JSON.stringify(ed.getJSON());
          onUpdateRef.current(json);
          setSaveStatus('saved');
        };

        if (debounceMs <= 0) {
          emit();
          return;
        }
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(emit, debounceMs);
      },
    },
    [],
  );

  // 세션 시작 글자 수 기록 + 초기 카운트 설정
  useEffect(() => {
    if (!editor) return;
    const chars = editor.storage.characterCount?.characters?.() ?? 0;
    const words = editor.storage.characterCount?.words?.() ?? 0;
    setSessionStartChars(chars);
    setCharCount(chars);
    setWordCount(words);
  }, [editor, itemId]);

  // itemId 변경 시 콘텐츠 교체 + 진행 중인 debounce 취소
  useEffect(() => {
    // 이전 문서의 debounce 타이머가 새 문서 내용을 덮어쓰는 것을 방지
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (!editor || editor.isDestroyed) return;
    editor.commands.setContent(parseContent(initialContent), { emitUpdate: false });
    setSaveStatus('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  // 언마운트 시 debounce 정리
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // CSS 변수로 서식 프리셋 적용
  const editorStyle: React.CSSProperties = {
    '--editor-font-size': `${settings.fontSize}px`,
    '--editor-line-height': String(settings.lineHeight),
    '--editor-indent': settings.autoIndent ? settings.indentSize : '0',
    '--editor-font-family':
      settings.fontFamily === 'serif'
        ? "'Batang', 'Noto Serif KR', serif"
        : settings.fontFamily === 'sans'
          ? "'Pretendard', 'Noto Sans KR', sans-serif"
          : 'inherit',
  } as React.CSSProperties;

  const wrapperClasses = cn(
    'folio-editor flex min-h-0 flex-1 flex-col',
    settings.autoIndent && 'auto-indent',
    settings.focusMode && 'focus-mode',
    settings.typewriterMode && 'typewriter-mode',
    settings.showLineNumbers && 'show-line-numbers',
    settings.showParagraphMarks && 'show-paragraph-marks',
    className,
  );

  return (
    <div className={wrapperClasses} style={editorStyle}>
      {/* 툴바 */}
      <EditorToolbar
        editor={editor}
        onToggleFindReplace={() => setFindReplaceOpen((v) => !v)}
        onToggleShortcutHelp={() => setShortcutHelpOpen(true)}
        onToggleSettings={() => setSettingsOpen((v) => !v)}
      />

      {/* 찾기/바꾸기 */}
      {editor && (
        <EditorFindReplace
          editor={editor}
          open={findReplaceOpen}
          onClose={() => setFindReplaceOpen(false)}
        />
      )}

      {/* 설정 패널 (relative container) */}
      <div className="relative">
        <EditorSettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </div>

      {/* 본문 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        <EditorContent editor={editor} style={{ minHeight: '100%', outline: 'none' }} />
        {editor && <EditorBubbleMenu editor={editor} />}
      </div>

      {/* 상태바 */}
      {showStatusBar && (
        <EditorStatusBar
          charCount={charCount}
          wordCount={wordCount}
          saveStatus={saveStatus}
          sessionStartChars={sessionStartChars}
        />
      )}

      {/* 단축키 도움말 모달 */}
      <EditorShortcutHelp open={shortcutHelpOpen} onClose={() => setShortcutHelpOpen(false)} />
    </div>
  );
}

function parseContent(raw: string | null): object | string {
  if (!raw) return '';
  try {
    return JSON.parse(raw) as object;
  } catch {
    return raw;
  }
}
