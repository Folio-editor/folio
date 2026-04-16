import { useState } from 'react';
import { ResizeHandle } from './ResizeHandle';

interface RightPanelsProps {
  width: number;
  onWidthChange: (delta: number) => void;
}

/**
 * 우측 패널 영역 — 문서 서브 뷰어를 위한 공간.
 * 현재는 빈 placeholder만 렌더한다.
 * 향후 세계관 노트, 캐릭터 카드 등의 참조 문서 뷰어로 채울 예정.
 */
export function RightPanels({ width, onWidthChange }: RightPanelsProps) {
  const [panels, setPanels] = useState([
    { id: 'a', visible: true },
    { id: 'b', visible: true },
  ]);

  const close = (id: string) =>
    setPanels((prev) => prev.map((p) => (p.id === id ? { ...p, visible: false } : p)));

  const visiblePanels = panels.filter((p) => p.visible);

  if (visiblePanels.length === 0) return null;

  return (
    <div
      style={{ width }}
      className="relative flex shrink-0 flex-col gap-2 border-l border-gray-200 p-2"
    >
      {/* 리사이즈 핸들 (좌측 엣지) */}
      <ResizeHandle
        side="left"
        onResize={onWidthChange}
        ariaLabel="우측 패널 너비 조절"
      />

      {visiblePanels.map((panel) => (
        <div
          key={panel.id}
          className="flex flex-1 flex-col rounded border border-gray-200 bg-white"
        >
          <div className="flex items-center justify-end border-b border-gray-100 px-2 py-1">
            <button
              type="button"
              onClick={() => close(panel.id)}
              className="text-sm text-gray-400 hover:text-gray-700"
              aria-label="패널 닫기"
            >
              ×
            </button>
          </div>
          {/* 향후 문서 뷰어 컴포넌트로 교체 */}
          <div className="flex-1" />
        </div>
      ))}
    </div>
  );
}
