import { useCallback, useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import {
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  GripVertical,
  X,
} from 'lucide-react';
import { AuxDocViewer } from '../AuxDocViewer';
import { BreadcrumbTitle } from '../BreadcrumbTitle';
import {
  AUX_DOC_LABELS,
  currentDocToAuxItem,
  type AuxDocType,
  type AuxPanelItem,
  type WorkspaceSection,
} from '../../../types/workspace';
import { cn } from '../../../lib/cn';

/* ── Docs 탭 (서브 스테이지 — 핀 슬롯) ── */

export function DocsTabContent({
  panels,
  onAddPanel,
  onRemovePanel,
  onReorderPanels,
  onToggleCollapse,
  onOpenInMain,
  isDraggingDoc,
  mainSection,
  mainItemId,
  selectedWorkId,
}: {
  panels: AuxPanelItem[];
  onAddPanel: (item: Omit<AuxPanelItem, 'id' | 'collapsed'>, index?: number) => void;
  onRemovePanel: (panelId: string) => void;
  onReorderPanels: (reordered: AuxPanelItem[]) => void;
  onToggleCollapse: (panelId: string) => void;
  onOpenInMain: (panel: AuxPanelItem) => void;
  isDraggingDoc: boolean;
  mainSection: WorkspaceSection | null;
  mainItemId: string | null;
  selectedWorkId: string | null;
}) {
  void onReorderPanels; // dnd-kit SortableContext 가 onDragEnd 처리. 본 prop 은 외부 핸들러용 placeholder.
  void isDraggingDoc; // 부모 RightPanels에서 외부 dragOver 감지용
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 잠금 정책 폐지 — WorldNoteInlineEditor가 외부 변경을 자동 동기화하므로
  // 메인/우측 패널 어디든 같은 노드를 동시 표시 + 즉시 반영. 동시 타이핑 한계는 collaborative
  // 도입 전까지 수용.

  // dnd-kit cross-component drop — 트리 노드를 우측 사이드바로 끌어왔을 때
  const { setNodeRef: setAuxDropRef, isOver: isAuxOver } = useDroppable({
    id: 'aux-pinned-area',
    data: { type: 'aux-area' },
  });

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
    setDropIndex(panels.length > 0 ? calcDropIndex(e.clientY) : 0);
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

  return (
    <div
      ref={setAuxDropRef}
      className={cn(
        'flex min-h-0 flex-1 flex-col',
        (isDragOver || isAuxOver) && 'bg-primary/5',
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {panels.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-4">
          <div className={cn(
            'rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors',
            (isDragOver || isAuxOver) ? 'border-primary bg-primary/10' : 'border-primary/30',
          )}>
            <p className="text-sm font-medium text-primary/70">여기에 문서를 놓으세요</p>
            <p className="mt-1 text-xs text-muted-foreground">
              더블 클릭 또는 드래그로 우측 핀 추가
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-2">
          <SortableContext
            items={panels.map((p) => p.id)}
            strategy={verticalListSortingStrategy}
          >
            <div ref={listRef} className="flex flex-col gap-1.5">
              {panels.map((panel, i) => (
                <div key={panel.id}>
                  {isDragOver && dropIndex === i && <DropIndicatorLine />}
                  <SortableAuxPanel
                    panel={panel}
                    onRemove={() => onRemovePanel(panel.id)}
                    onToggleCollapse={() => onToggleCollapse(panel.id)}
                    onOpenInMain={() => onOpenInMain(panel)}
                    onAddPanel={onAddPanel}
                    mainSection={mainSection}
                    mainItemId={mainItemId}
                    selectedWorkId={selectedWorkId}
                  />
                </div>
              ))}
              {isDragOver && dropIndex === panels.length && <DropIndicatorLine />}
            </div>
          </SortableContext>
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

/** 메인 에디터의 (section, itemId)와 패널의 (docType, docId)가 동일한 문서인지 판별 */
function isSameAsMain(
  panel: AuxPanelItem,
  mainSection: WorkspaceSection | null,
  mainItemId: string | null,
): boolean {
  if (!mainSection || !mainItemId) return false;
  const mainAux = currentDocToAuxItem(mainSection, mainItemId, '');
  if (!mainAux) return false;
  return mainAux.docType === panel.docType && mainAux.docId === panel.docId;
}

function SortableAuxPanel({
  panel,
  onRemove,
  onToggleCollapse,
  onOpenInMain,
  onAddPanel,
  mainSection,
  mainItemId,
  selectedWorkId,
}: {
  panel: AuxPanelItem;
  onRemove: () => void;
  onToggleCollapse: () => void;
  onOpenInMain: () => void;
  onAddPanel: (item: Omit<AuxPanelItem, 'id' | 'collapsed'>, index?: number) => void;
  mainSection: WorkspaceSection | null;
  mainItemId: string | null;
  selectedWorkId: string | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: panel.id, data: { type: 'panel' } });
  const style = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [contentHeight, setContentHeight] = useState(PANEL_DEFAULT_H);

  // 메인과 동일 문서면 시각 표시 (badge) 용도로만 — 편집은 InlineEditor가 외부 sync로 처리
  const sameAsMain = isSameAsMain(panel, mainSection, mainItemId);

  return (
    <div ref={setNodeRef} style={style} {...attributes} data-panel-id={panel.id}>
      <div className="rounded-md border border-border bg-background">
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
            {panel.collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          </button>
          <BreadcrumbTitle
            className="min-w-0 flex-1 text-xs"
            items={
              panel.title
                ? panel.title.split(' / ').map((s) => s.trim())
                : ['(제목 없음)']
            }
          />
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {AUX_DOC_LABELS[panel.docType]}
          </span>
          {sameAsMain && (
            <span
              className="shrink-0 text-[9px] text-muted-foreground"
              title="메인에서도 편집 중 — 양쪽 즉시 동기화"
            >
              메인에서 편집 중
            </span>
          )}
          <button
            type="button"
            onClick={onOpenInMain}
            title="본문으로 열기"
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-primary/10 hover:text-primary"
            aria-label="본문으로 열기"
          >
            <ArrowUpRight size={12} />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            aria-label="패널 닫기"
          >
            <X size={12} />
          </button>
        </div>

        {!panel.collapsed && (
          <>
            <div
              style={{ height: contentHeight }}
              className="overflow-y-auto"
            >
              <AuxDocViewer
                docType={panel.docType}
                docId={panel.docId}
                workId={selectedWorkId ?? undefined}
                editable={true}
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
