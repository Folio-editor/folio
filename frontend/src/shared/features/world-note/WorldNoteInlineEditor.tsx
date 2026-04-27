import { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Typography from '@tiptap/extension-typography';
import { useFocusedEditorStore } from '../../stores/focusedEditorStore';

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
  // 마지막으로 저장된(또는 mount/노드 전환 시 동기화된) JSON 직렬화 — 자기 onUpdate echo skip용
  const lastSavedJsonRef = useRef<string | null>(null);
  // 마지막으로 DB로 emit한 raw string — 외부 변경 vs 자기 echo 식별용
  // (외부 PowerSync sync로 들어온 initialContent와 비교)
  const lastEmittedRawRef = useRef<string | null>(null);

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
        TextAlign.configure({ types: ['heading', 'paragraph'] }),
        Typography,
      ],
      content: parseContent(initialContent),
      onCreate: ({ editor: ed }) => {
        lastSavedJsonRef.current = JSON.stringify(ed.getJSON());
        lastEmittedRawRef.current = initialContent ?? '';
      },
      onFocus: ({ editor: ed }) => {
        useFocusedEditorStore.getState().focusEditor(ed);
      },
      onBlur: ({ editor: ed }) => {
        useFocusedEditorStore.getState().blurEditor(ed);
      },
      onUpdate: ({ editor: ed }) => {
        const next = JSON.stringify(ed.getJSON());
        // onCreate 전(매우 드문 race)이면 동기화만 하고 종료
        if (lastSavedJsonRef.current === null) {
          lastSavedJsonRef.current = next;
          return;
        }
        if (next === lastSavedJsonRef.current) return;
        lastSavedJsonRef.current = next;

        const cb = onUpdateRef.current;
        pendingRef.current = () => {
          // DB로 emit하기 직전에 lastEmittedRaw 갱신 — 외부 sync useEffect가 자기 echo로 인식해 skip
          lastEmittedRawRef.current = next;
          cb(next);
        };
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          pendingRef.current?.();
          pendingRef.current = null;
          debounceRef.current = null;
        }, DEBOUNCE_MS);
      },
    },
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
    // setContent 후 lastSaved/lastEmitted 갱신 — 다음 사용자 입력은 자연스럽게 비교/저장
    lastSavedJsonRef.current = JSON.stringify(editor.getJSON());
    lastEmittedRawRef.current = initialContent ?? '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  // 외부 DB 변경(다른 화면/패널에서 같은 노드 편집) 즉시 반영 — initialContent prop 변경 감지
  // 가드 4중: 자기 echo / pending / focus / 노드 전환 effect와의 충돌
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const incoming = initialContent ?? '';
    // 가드 1: 자기가 마지막으로 emit한 raw string과 동일 → 자기 echo, skip
    if (incoming === lastEmittedRawRef.current) return;
    // 가드 2: 자기 debounce pending 중 → 자기 입력 우선 (last-write-wins 경계)
    if (debounceRef.current) return;
    // 가드 3: 자기 focus 중 → cursor 점프 방지로 skip
    if (editor.isFocused) return;
    // 가드 4: 외부 변경 적용 + lastSaved/lastEmitted 모두 동기화
    editor.commands.setContent(parseContent(incoming), { emitUpdate: false });
    lastSavedJsonRef.current = JSON.stringify(editor.getJSON());
    lastEmittedRawRef.current = incoming;
  }, [initialContent, editor]);

  // 언마운트 flush + focusedEditorStore 정리 (자기 자신만 비움)
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      pendingRef.current?.();
      if (editor && !editor.isDestroyed) {
        useFocusedEditorStore.getState().blurEditor(editor);
      }
    };
    // editor 인스턴스가 mount 시 결정되어 변하지 않으므로 [] 사용 — destroy는 editor 자체가 처리
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      className={`note-inline-editor ${proseClass} [&_.tiptap]:outline-none [&_.tiptap_p.is-editor-empty:first-child::before]:float-left [&_.tiptap_p.is-editor-empty:first-child::before]:h-0 [&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none [&_.tiptap_p.is-editor-empty:first-child::before]:text-muted-foreground/40 [&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]`}
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
