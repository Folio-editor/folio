import { useEffect, useState } from 'react';
import EditorFindReplace from './EditorFindReplace';
import { useFocusedEditor } from '../../stores/focusedEditorStore';

/**
 * mode='shared' 툴바를 사용하는 화면(PlotOverview / CharacterOverview /
 * WorldNoteHierarchyScreen 등)에서 Ctrl+F · Ctrl+H 단축키로 찾기/바꾸기 패널을 띄운다.
 *
 * 마지막 포커스된 인라인 에디터(focusedEditorStore)에 대해 동작.
 * 인라인 에디터들은 inlineExtensions.ts의 preset에 FindReplace extension을 포함하므로
 * editor.storage.findReplace가 항상 존재한다.
 */
export function SharedFindReplace() {
  const editor = useFocusedEditor();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 'f' || e.key === 'F' || e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // editor가 destroyed/null이면 마운트하지 않음 — 인라인 에디터의 onCreate에서
  // store에 자동 등록되므로 통합뷰 진입 직후부터 editor가 존재한다.
  if (!editor || editor.isDestroyed) return null;
  return (
    <EditorFindReplace
      editor={editor}
      open={open}
      onClose={() => setOpen(false)}
    />
  );
}
