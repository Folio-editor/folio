import { PanelTopClose, PanelTopOpen } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useEditorToolbarStore } from '../../stores/editorToolbarStore';

/**
 * 에디터 툴바 가시성 토글 — MainPanelHeader trailing 슬롯에 들어가는 작은 아이콘 버튼.
 * 모든 메인 편집 화면에 동일하게 노출되어 통일된 진입점 제공.
 */
export function EditorToolbarToggle() {
  const visible = useEditorToolbarStore((s) => s.visible);
  const toggle = useEditorToolbarStore((s) => s.toggle);

  return (
    <button
      type="button"
      onClick={toggle}
      title={visible ? '툴바 숨기기' : '툴바 보기'}
      aria-label={visible ? '에디터 툴바 숨기기' : '에디터 툴바 보기'}
      aria-pressed={visible}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-md transition-colors',
        visible
          ? 'text-foreground hover:bg-muted'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {visible ? (
        <PanelTopClose size={15} strokeWidth={1.75} />
      ) : (
        <PanelTopOpen size={15} strokeWidth={1.75} />
      )}
    </button>
  );
}
