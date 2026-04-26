import { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';

interface WorldNoteInlineEditorProps {
  noteId: string;
  initialContent: string | null;
  placeholder?: string;
  onUpdate: (json: string) => void;
  /** 본문 텍스트 톤 — base(기본), sm(작게), xs(우측 사이드바용 매우 작게) */
  size?: 'base' | 'sm' | 'xs';
  /** false면 cursor 비활성, 편집 불가 (lockedReadOnly 등). 기본 true. */
  editable?: boolean;
}

const DEBOUNCE_MS = 800;

/**
 * 사전형 통합 뷰 전용 가벼운 인라인 에디터.
 * - 캐릭터 InlineNoteItem 패턴 차용 (StarterKit + Placeholder + Highlight 만)
 * - 카드 박스 없이 자연스러운 prose 흐름
 * - placeholder는 inline CSS로 — 별도 박스/border 없음
 * - editor instance는 항상 활성 (lazy hydrate 없음 — 일관된 사이즈/UX)
 */
export function WorldNoteInlineEditor({
  noteId,
  initialContent,
  placeholder = '내용을 입력하세요…',
  onUpdate,
  size = 'base',
  editable = true,
}: WorldNoteInlineEditorProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const pendingRef = useRef<(() => void) | null>(null);
  // mount/setContent 이후 첫 onUpdate transaction은 placeholder/plugin 초기화로 인한 가짜 → 무시
  const skipNextUpdateRef = useRef(true);
  // 마지막으로 저장된 JSON 직렬화 — 동일 내용 중복 update 차단
  const lastSavedJsonRef = useRef<string>('');

  const editor = useEditor(
    {
      immediatelyRender: false,
      editable,
      editorProps: {
        attributes: { spellcheck: 'false' },
      },
      extensions: [
        StarterKit.configure({ code: false, codeBlock: false }),
        Placeholder.configure({ placeholder }),
        Highlight.configure({ multicolor: false }),
      ],
      content: parseContent(initialContent),
      onUpdate: ({ editor: ed }) => {
        const next = JSON.stringify(ed.getJSON());
        // mount/noteId 전환 직후 첫 transaction(placeholder 등)은 무시
        if (skipNextUpdateRef.current) {
          skipNextUpdateRef.current = false;
          lastSavedJsonRef.current = next;
          return;
        }
        // 동일 내용 (예: setContent로 이미 같은 JSON 적용된 직후) → skip
        if (next === lastSavedJsonRef.current) return;
        lastSavedJsonRef.current = next;

        const cb = onUpdateRef.current;
        pendingRef.current = () => cb(next);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          pendingRef.current?.();
          pendingRef.current = null;
          debounceRef.current = null;
        }, DEBOUNCE_MS);
      },
    },
    // 빈 의존성: editor 인스턴스를 컴포넌트 lifetime 동안 1회만 생성.
    // noteId 변경 시 setContent useEffect(emitUpdate: false)로 콘텐츠만 교체.
    // → noteId 전환마다 Placeholder/StarterKit plugin 초기화 transaction이 발동되어
    //    빈 doc을 자동 저장(=DB UPDATE → PowerSync sync)하던 현상 차단.
    [],
  );

  // noteId 변경 시 이전 보류 저장 flush + 콘텐츠 교체
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    pendingRef.current?.();
    pendingRef.current = null;
    if (!editor || editor.isDestroyed) return;
    editor.commands.setContent(parseContent(initialContent), {
      emitUpdate: false,
    });
    // setContent 직후 placeholder/plugin이 발동시키는 첫 onUpdate transaction 무시 + lastSaved 동기화
    skipNextUpdateRef.current = true;
    lastSavedJsonRef.current = JSON.stringify(editor.getJSON());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  // 언마운트 flush
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      pendingRef.current?.();
    };
  }, []);

  // editable prop 변경 시 editor에 반영 (mode 전환 없이 cursor 활성/비활성만)
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (editor.isEditable !== editable) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  // prose 사이즈 — base(통합 뷰 상위), sm(통합 뷰 하위), xs(우측 사이드바)
  const proseClass =
    size === 'base'
      ? 'prose prose-sm dark:prose-invert max-w-none leading-relaxed text-foreground'
      : size === 'sm'
        ? 'prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed text-foreground/85'
        : 'prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed text-foreground/85';

  return (
    <EditorContent
      editor={editor}
      className={`${proseClass} [&_.tiptap]:outline-none [&_.tiptap_p.is-editor-empty:first-child::before]:float-left [&_.tiptap_p.is-editor-empty:first-child::before]:h-0 [&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none [&_.tiptap_p.is-editor-empty:first-child::before]:text-muted-foreground/40 [&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]`}
    />
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
