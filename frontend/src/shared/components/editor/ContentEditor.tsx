import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import Typography from '@tiptap/extension-typography';
import CharacterCount from '@tiptap/extension-character-count';
import TextAlign from '@tiptap/extension-text-align';
import Color from '@tiptap/extension-color';
import { TextStyle, FontFamily, FontSize } from '@tiptap/extension-text-style';
import { cn } from '../../lib/cn';
import { useEditorSettings } from '../../stores/editorSettingsStore';
import { useEditorToolbarStore } from '../../stores/editorToolbarStore';
import { registerEditor, unregisterEditor } from '../../lib/activeEditorRegistry';
import SceneBreak from './extensions/SceneBreak';
import KoreanPunctuation from './extensions/KoreanPunctuation';
import AutoPairQuotes from './extensions/AutoPairQuotes';
import AuthorNote from './extensions/AuthorNote';
import TabIndent from './extensions/TabIndent';
import TypewriterMode from './extensions/TypewriterMode';
import FocusMode from './extensions/FocusMode';
import FindReplace from './extensions/FindReplace';
import ReviewHighlight from './extensions/ReviewHighlight';
import { useReviewHighlightStore } from '../../stores/reviewHighlightStore';
import { UnifiedEditorToolbar } from './UnifiedEditorToolbar';
import EditorBubbleMenu from './EditorBubbleMenu';
import EditorStatusBar from './EditorStatusBar';
import EditorSettingsPanel from './EditorSettingsPanel';
import EditorFindReplace from './EditorFindReplace';
import { useHelpModalStore } from '../../stores/helpModalStore';
import { analytics, charCountBucket, deltaCharCountBucket, editDurationBucket } from '../../lib/analytics';

interface ContentEditorProps {
  itemId: string;
  initialContent: string | null;
  placeholder?: string;
  onUpdate: (json: string) => void | Promise<void>;
  debounceMs?: number;
  className?: string;
  showStatusBar?: boolean;
  /** 컴팩트 모드 — 툴바/설정/찾기 숨김, 단축키 전용 편집 (우측 사이드바용) */
  compact?: boolean;
  onCharCountChange?: (count: number) => void;
}

// Plan C 결정 3 — onUpdate 디바운스 300~500ms 범위. 빠른 타이핑 시 매 키스트로크마다
// AES-GCM 암호화 + db.execute(UPDATE) + PowerSync CRUD 큐 적재가 발생하므로 400ms로 일괄.
const DEFAULT_DEBOUNCE_MS = 400;

export function ContentEditor({
  itemId,
  initialContent,
  placeholder = '내용을 작성하세요…',
  onUpdate,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  className,
  showStatusBar = true,
  compact = false,
  onCharCountChange,
}: ContentEditorProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const charCountDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onUpdateRef = useRef(onUpdate);
  const onCharCountChangeRef = useRef(onCharCountChange);
  onUpdateRef.current = onUpdate;
  onCharCountChangeRef.current = onCharCountChange;

  // flush용: 디바운스 생성 시점의 콜백을 캡처하여 itemId 전환 시 올바른 대상에 저장
  const pendingSaveRef = useRef<(() => void) | null>(null);
  const pendingCharCountSaveRef = useRef<(() => void) | null>(null);
  // 마지막으로 DB로 emit한 raw string — 외부 변경 vs 자기 echo 식별용
  const lastEmittedRawRef = useRef<string | null>(null);

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [charCount, setCharCount] = useState(0);
  const [wordCount, setWordCount] = useState(0);
  const [sessionStartChars, setSessionStartChars] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const openShortcutHelp = useHelpModalStore((s) => s.openShortcutHelp);
  const editStartedRef = useRef(false);
  const editSessionStartRef = useRef<number | null>(null);
  const charCountRef = useRef(0);
  const sessionStartCharsRef = useRef(0);

  const settings = useEditorSettings();
  const globalToolbarVisible = useEditorToolbarStore((s) => s.visible);
  // compact prop은 호출처 강제 override(우측 사이드바 등 좁은 폭)
  // 그 외엔 글로벌 토글이 단일 진실 소스
  const toolbarVisible = !compact && globalToolbarVisible;

  const editor = useEditor(
    {
      immediatelyRender: false,
      // 한국어 형태론 한계로 Chromium 내장 spellcheck false positive 폭주 → 본문 영역에서만 비활성.
      // 작품 제목·작가명 등 단순 input은 영향 없음 (이 attribute는 contenteditable에만 적용).
      editorProps: {
        attributes: {
          spellcheck: 'false',
        },
      },
      extensions: [
        // StarterKit v3.x 부터 Underline 기본 포함 — 별도 import 시 'Duplicate extension names' 경고
        StarterKit.configure({
          code: false,
          codeBlock: false,
          link: { openOnClick: false },
        }),
        Placeholder.configure({ placeholder }),
        Highlight.configure({ multicolor: true }),
        Typography,
        CharacterCount,
        TextAlign.configure({ types: ['heading', 'paragraph'] }),
        TextStyle,
        Color.configure({ types: ['textStyle'] }),
        FontFamily.configure({ types: ['textStyle'] }),
        FontSize.configure({ types: ['textStyle'] }),
        SceneBreak,
        KoreanPunctuation.configure({ enabled: settings.autoKoreanPunctuation }),
        AutoPairQuotes.configure({ enabled: settings.autoPairQuotes }),
        AuthorNote,
        TabIndent,
        TypewriterMode.configure({
          enabled: settings.typewriterMode,
          position: settings.typewriterPosition,
        }),
        FocusMode.configure({ enabled: settings.focusMode }),
        FindReplace,
        ReviewHighlight,
      ],
      content: parseContent(initialContent),
      onUpdate: ({ editor: ed }) => {
        setSaveStatus('saving');

        // 글자 수 UI 즉시 갱신
        const chars = ed.storage.characterCount?.characters?.() ?? 0;
        const words = ed.storage.characterCount?.words?.() ?? 0;
        setCharCount(chars);
        setWordCount(words);
        charCountRef.current = chars;

        if (!editStartedRef.current) {
          editStartedRef.current = true;
          editSessionStartRef.current = Date.now();
          void analytics.track('writing_started', {
            platform: window.folio.platform,
            doc_type: 'unknown',
            entry_source: 'editor',
          });
          void analytics.track('document_edit_started', {
            doc_type: 'unknown',
            char_count_bucket: charCountBucket(chars),
          });
        }

        // charCount DB 저장 디바운스
        if (onCharCountChangeRef.current) {
          if (charCountDebounceRef.current) clearTimeout(charCountDebounceRef.current);
          // 현재 시점의 콜백을 캡처 — flush 시 올바른 대상에 저장
          const charCountCb = onCharCountChangeRef.current;
          pendingCharCountSaveRef.current = () => charCountCb(chars);
          charCountDebounceRef.current = setTimeout(() => {
            pendingCharCountSaveRef.current?.();
            pendingCharCountSaveRef.current = null;
          }, debounceMs);
        }

        // content DB 저장 디바운스
        // 현재 시점의 콜백을 캡처 — itemId 전환 시에도 이전 item에 정확히 저장
        const updateCb = onUpdateRef.current;
        pendingSaveRef.current = () => {
          const json = JSON.stringify(ed.getJSON());
          // emit 직전에 lastEmittedRaw 갱신 — 외부 sync useEffect가 자기 echo로 인식해 skip
          lastEmittedRawRef.current = json;
          try {
            const result = updateCb(json);
            if (result instanceof Promise) {
              result.catch(() => {
                void analytics.track('document_save_failed', {
                  doc_type: 'unknown',
                  reason_code: 'local_write_failed',
                });
              });
            }
          } catch {
            void analytics.track('document_save_failed', {
              doc_type: 'unknown',
              reason_code: 'local_write_failed',
            });
          }
          setSaveStatus('saved');
        };

        if (debounceMs <= 0) {
          pendingSaveRef.current();
          pendingSaveRef.current = null;
          return;
        }
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          pendingSaveRef.current?.();
          pendingSaveRef.current = null;
          debounceRef.current = null;
        }, debounceMs);
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
    sessionStartCharsRef.current = chars;
    charCountRef.current = chars;
    editStartedRef.current = false;
    editSessionStartRef.current = null;
  }, [editor, itemId]);

  // 검수 하이라이트 스토어 구독 → 데코레이션 리빌드
  useEffect(() => {
    if (!editor) return;
    let prevVersion = useReviewHighlightStore.getState().version;
    const unsub = useReviewHighlightStore.subscribe((s) => {
      if (s.version !== prevVersion) {
        prevVersion = s.version;
        if (!editor.isDestroyed) {
          editor.commands.triggerReviewHighlightRebuild();
        }
      }
    });
    return unsub;
  }, [editor]);

  // 보류 중인 디바운스를 즉시 실행 (flush)
  // pendingSaveRef에 캡처된 콜백을 사용하므로 itemId 전환 시에도 올바른 대상에 저장됨
  const flushRef = useRef(() => {});
  flushRef.current = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    pendingSaveRef.current?.();
    pendingSaveRef.current = null;

    if (charCountDebounceRef.current) {
      clearTimeout(charCountDebounceRef.current);
      charCountDebounceRef.current = null;
    }
    pendingCharCountSaveRef.current?.();
    pendingCharCountSaveRef.current = null;
  };

  // itemId 변경 시 이전 문서의 보류 중인 변경사항 즉시 저장 후 콘텐츠 교체
  useEffect(() => {
    flushRef.current();
    if (!editor || editor.isDestroyed) return;
    editor.commands.setContent(parseContent(initialContent), { emitUpdate: false });
    lastEmittedRawRef.current = initialContent ?? '';
    setSaveStatus('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  // 외부 DB 변경(다른 화면/패널에서 같은 노트 편집) 즉시 반영 — initialContent prop 변경 감지
  // 가드: 자기 echo / pending debounce / focus 중에는 skip
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const incoming = initialContent ?? '';
    // mount 직후 lastEmittedRaw가 null이면 초기 sync.
    // 빈 값으로 먼저 렌더된 뒤 DB content가 늦게 도착하는 경우도 반영한다.
    if (lastEmittedRawRef.current === null) {
      lastEmittedRawRef.current = incoming;
      if (incoming) {
        editor.commands.setContent(parseContent(incoming), { emitUpdate: false });
      }
      return;
    }
    if (incoming === lastEmittedRawRef.current) return;
    if (debounceRef.current) return; // 자기 입력 중
    if (editor.isFocused) return; // cursor 점프 방지
    editor.commands.setContent(parseContent(incoming), { emitUpdate: false });
    lastEmittedRawRef.current = incoming;
  }, [initialContent, editor]);

  // 언마운트 시 보류 중인 변경사항 즉시 저장
  useEffect(() => {
    return () => {
      flushRef.current();
      if (editStartedRef.current) {
        const startedAt = editSessionStartRef.current ?? Date.now();
        void analytics.track('document_edit_session_ended', {
          doc_type: 'unknown',
          edit_duration_bucket: editDurationBucket(Date.now() - startedAt),
          delta_char_count_bucket: deltaCharCountBucket(
            charCountRef.current - sessionStartCharsRef.current,
          ),
        });
      }
    };
  }, []);

  // 우측 패널(맞춤법 검사 등)에서 이 에디터에 명령을 보낼 수 있도록 itemId로 인스턴스 등록
  useEffect(() => {
    if (!editor) return;
    registerEditor(itemId, editor);
    return () => unregisterEditor(itemId, editor);
  }, [editor, itemId]);

  // Ctrl+F / Ctrl+H — FindReplace 패널 열기
  // FindReplace extension은 브라우저 기본 동작만 차단하므로 UI 토글은 여기서 직접 처리
  useEffect(() => {
    if (!editor) return;
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 'f' || e.key === 'F') {
        if (!editor.isFocused) return;
        e.preventDefault();
        setFindReplaceOpen(true);
      } else if (e.key === 'h' || e.key === 'H') {
        if (!editor.isFocused) return;
        e.preventDefault();
        setFindReplaceOpen(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [editor]);

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
      {/* 툴바 — compact 모드 / 글로벌 토글 OFF에서는 숨김 (단축키 전용 편집) */}
      {toolbarVisible && (
        <>
          <UnifiedEditorToolbar
            mode="single"
            editor={editor}
            onToggleFindReplace={() => setFindReplaceOpen((v) => !v)}
            onToggleShortcutHelp={openShortcutHelp}
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
        </>
      )}

      {/* 본문 — 클릭 시 에디터 포커스 보장 */}
      <div
        className="min-h-0 flex-1 cursor-text overflow-y-auto px-8 py-6"
        onMouseDown={() => {
          // 에디터가 포커스를 잃은 상태에서 영역 어디든 클릭하면 포커스 복원
          // TipTap 내부 클릭은 자체 처리하지만, blur 상태에서는 명시적 focus가 필요
          if (editor && !editor.isFocused) {
            // 약간의 지연으로 TipTap의 자체 클릭 처리와 충돌 방지
            requestAnimationFrame(() => {
              if (!editor.isFocused) editor.commands.focus();
            });
          }
        }}
      >
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
          showManuscriptCount
        />
      )}

      {/* 단축키 도움말 모달은 AuthenticatedApp 에서 한 번만 마운트 (글로벌 F1 공유) */}
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
