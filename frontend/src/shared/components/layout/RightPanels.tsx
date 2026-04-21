import { useCallback, useRef, useState } from 'react';
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { ChevronDown, ChevronRight, GripVertical, X } from 'lucide-react';
import { ResizeHandle } from './ResizeHandle';
import { AuxDocViewer } from './AuxDocViewer';
import type { AuxPanelItem, AuxDocType } from '../../types/workspace';
import { AUX_DOC_LABELS } from '../../types/workspace';
import { cn } from '../../lib/cn';

interface RightPanelsProps {
  width: number;
  onWidthChange: (delta: number) => void;
  panels: AuxPanelItem[];
  onAddPanel: (item: Omit<AuxPanelItem, 'id' | 'collapsed'>, index?: number) => void;
  onRemovePanel: (panelId: string) => void;
  onReorderPanels: (reordered: AuxPanelItem[]) => void;
  onToggleCollapse: (panelId: string) => void;
  isDraggingDoc: boolean;
}

/**
 * 우측 보조 패널 영역.
 * - 좌측 사이드바에서 native DnD로 문서를 드롭하여 핀
 * - 드래그 중 삽입 위치를 인디케이터 선으로 미리 표시
 * - 패널 간 @dnd-kit으로 순서 변경
 * - 스크롤로 다수 패널 수용
 * - 접기/펼치기 토글
 */
export function RightPanels({
  width,
  onWidthChange,
  panels,
  onAddPanel,
  onRemovePanel,
  onReorderPanels,
  onToggleCollapse,
  isDraggingDoc,
}: RightPanelsProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  /** 마우스 Y 위치로 삽입할 인덱스를 계산 */
  const calcDropIndex = (clientY: number): number => {
    if (!listRef.current) return panels.length;
    const children = listRef.current.querySelectorAll('[data-panel-id]');
    for (let i = 0; i < children.length; i++) {
      const rect = children[i].getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (clientY < midY) return i;
    }
    return panels.length;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
    if (panels.length > 0) {
      setDropIndex(calcDropIndex(e.clientY));
    } else {
      setDropIndex(0);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragOver(false);
    setDropIndex(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const idx = dropIndex ?? panels.length;
    setIsDragOver(false);
    setDropIndex(null);
    const raw = e.dataTransfer.getData('application/folio-doc');
    if (!raw) return;
    try {
      const { docType, docId, title } = JSON.parse(raw) as {
        docType: AuxDocType;
        docId: string;
        title: string;
      };
      onAddPanel({ docType, docId, title }, idx);
    } catch { /* invalid payload */ }
  };

  const handleSortEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = panels.findIndex((p) => p.id === active.id);
    const newIdx = panels.findIndex((p) => p.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    onReorderPanels(arrayMove(panels, oldIdx, newIdx));
  };

  return (
    <div
      style={{ width }}
      className={cn(
        'relative flex shrink-0 flex-col border-l border-border',
        isDragOver && 'bg-primary/5',
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <ResizeHandle
        side="left"
        onResize={onWidthChange}
        ariaLabel="우측 패널 너비 조절"
      />

      {/* 빈 상태 */}
      {panels.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-4">
          <div className={cn(
            'rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors',
            isDragOver
              ? 'border-primary bg-primary/10'
              : 'border-primary/30',
          )}>
            <p className="text-sm font-medium text-primary/70">여기에 문서를 놓으세요</p>
            <p className="mt-1 text-xs text-muted-foreground">
              사이드바에서 드래그하여 문서를 핀할 수 있습니다
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-2">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleSortEnd}
          >
            <SortableContext
              items={panels.map((p) => p.id)}
              strategy={verticalListSortingStrategy}
            >
              <div ref={listRef} className="flex flex-col gap-1.5">
                {panels.map((panel, i) => (
                  <div key={panel.id}>
                    {/* 삽입 인디케이터 — 이 패널 위 */}
                    {isDragOver && dropIndex === i && <DropIndicatorLine />}
                    <SortableAuxPanel
                      panel={panel}
                      onRemove={() => onRemovePanel(panel.id)}
                      onToggleCollapse={() => onToggleCollapse(panel.id)}
                      onAddPanel={onAddPanel}
                    />
                  </div>
                ))}
                {/* 삽입 인디케이터 — 맨 아래 */}
                {isDragOver && dropIndex === panels.length && <DropIndicatorLine />}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}
    </div>
  );
}

/* ── 삽입 위치 인디케이터 ── */

function DropIndicatorLine() {
  return (
    <div className="flex items-center gap-1 py-0.5">
      <div className="h-1.5 w-1.5 rounded-full bg-primary" />
      <div className="h-0.5 flex-1 rounded-full bg-primary/50" />
      <div className="h-1.5 w-1.5 rounded-full bg-primary" />
    </div>
  );
}

/* ── Sortable 패널 래퍼 ── */

const PANEL_MIN_H = 80;
const PANEL_DEFAULT_H = 200;
const PANEL_MAX_H = 600;

function SortableAuxPanel({
  panel,
  onRemove,
  onToggleCollapse,
  onAddPanel,
}: {
  panel: AuxPanelItem;
  onRemove: () => void;
  onToggleCollapse: () => void;
  onAddPanel: (item: Omit<AuxPanelItem, 'id' | 'collapsed'>, index?: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: panel.id });
  const style = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [contentHeight, setContentHeight] = useState(PANEL_DEFAULT_H);

  return (
    <div ref={setNodeRef} style={style} {...attributes} data-panel-id={panel.id}>
      <div className="rounded-md border border-border bg-background">
        {/* 패널 헤더 */}
        <div className="flex items-center gap-1 border-b border-border/50 px-2 py-1.5">
          <span
            {...listeners}
            className="cursor-grab text-muted-foreground hover:text-foreground"
          >
            <GripVertical size={12} />
          </span>
          <button
            type="button"
            onClick={onToggleCollapse}
            className="text-muted-foreground hover:text-foreground"
          >
            {panel.collapsed
              ? <ChevronRight size={12} />
              : <ChevronDown size={12} />}
          </button>
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
            {panel.title || '(제목 없음)'}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {AUX_DOC_LABELS[panel.docType]}
          </span>
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            aria-label="패널 닫기"
          >
            <X size={12} />
          </button>
        </div>

        {/* 패널 본문 — 내부 스크롤 + 높이 조절 */}
        {!panel.collapsed && (
          <>
            <div
              style={{ height: contentHeight }}
              className="overflow-y-auto"
            >
              <AuxDocViewer
                docType={panel.docType}
                docId={panel.docId}
                onAddPanel={onAddPanel}
              />
            </div>
            <VerticalResizeHandle
              onResize={(delta) =>
                setContentHeight((h) =>
                  Math.max(PANEL_MIN_H, Math.min(PANEL_MAX_H, h + delta)),
                )
              }
            />
          </>
        )}
      </div>
    </div>
  );
}

/* ── 수직 리사이즈 핸들 (패널 하단) ── */

function VerticalResizeHandle({ onResize }: { onResize: (deltaPx: number) => void }) {
  const lastY = useRef(0);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      lastY.current = e.clientY;
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'row-resize';

      const onMove = (ev: PointerEvent) => {
        const delta = ev.clientY - lastY.current;
        lastY.current = ev.clientY;
        onResize(delta);
      };
      const onUp = () => {
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      };
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
    },
    [onResize],
  );

  return (
    <div
      onPointerDown={onPointerDown}
      className="group flex h-2 cursor-row-resize items-center justify-center border-t border-border/30 hover:bg-primary/5"
      role="separator"
      aria-orientation="horizontal"
      aria-label="패널 높이 조절"
    >
      <div className="h-0.5 w-8 rounded-full bg-border group-hover:bg-primary/40 transition-colors" />
    </div>
  );
}
