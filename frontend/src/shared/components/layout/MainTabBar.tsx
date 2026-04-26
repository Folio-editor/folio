// ============================================================
// MainTabBar — 메인 패널 다중 탭 바 (VSCode 식)
// ============================================================
// - 탭 클릭 = 활성 전환
// - 가운데 클릭 / × / Ctrl+W = 탭 닫기
// - 우클릭 메뉴: 닫기 / 다른 탭 모두 닫기 / 오른쪽 탭 모두 닫기
// - + 버튼 = 빈 탭 추가 (welcome)
// - ◁ ▷ = 활성 탭 history back/forward
// - 가로 스크롤 (휠 deltaY → scrollLeft 변환)
// - 드래그 재정렬 (별도 DndContext, horizontalListSortingStrategy)
// ============================================================

import { useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@powersync/react';
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Plus,
  X,
} from 'lucide-react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '../ui/context-menu';
import { useMainTabsStore } from '../../stores/mainTabsStore';
import type { MainDoc, MainTab, WorkspaceSection } from '../../types/workspace';
import { cn } from '../../lib/cn';

const TAB_TITLE_QUERIES: Record<WorkspaceSection, string> = {
  episode: 'SELECT title FROM episode WHERE id = ? LIMIT 1',
  'world-note': 'SELECT name AS title FROM world_note WHERE id = ? LIMIT 1',
  plan: 'SELECT title FROM plan_note WHERE id = ? LIMIT 1',
  plot: 'SELECT title FROM plot WHERE id = ? LIMIT 1',
  foreshadow: 'SELECT title FROM foreshadow WHERE id = ? LIMIT 1',
  // character는 cnote:/char: prefix로 분기 — 컴포넌트 내부에서 처리
  character: '',
  'idea-archive': 'SELECT content AS title FROM idea_archive WHERE id = ? LIMIT 1',
};

function useTabTitle(doc: MainDoc | null): string {
  const isCharacter = doc?.section === 'character';
  const charPrefix = isCharacter && doc?.itemId.startsWith('char:');
  const cnotePrefix = isCharacter && doc?.itemId.startsWith('cnote:');
  const charId = charPrefix ? doc!.itemId.slice(5) : null;
  const cnoteId = cnotePrefix ? doc!.itemId.slice(6) : null;

  const generalSql = !isCharacter && doc ? TAB_TITLE_QUERIES[doc.section] : '';
  const generalParams = !isCharacter && doc ? [doc.itemId] : [];
  const charSql = charId ? 'SELECT name AS title FROM character WHERE id = ? LIMIT 1' : '';
  const cnoteSql = cnoteId ? 'SELECT title FROM character_note WHERE id = ? LIMIT 1' : '';

  // 사용 안 하는 분기는 빈 결과 SQL로 — useQuery 항상 호출 (hooks rule)
  const fallbackSql = 'SELECT NULL AS title WHERE 0';
  const { data: generalRows = [] } = useQuery<{ title: string | null }>(
    generalSql || fallbackSql,
    generalSql ? generalParams : [],
  );
  const { data: charRows = [] } = useQuery<{ title: string | null }>(
    charSql || fallbackSql,
    charSql ? [charId!] : [],
  );
  const { data: cnoteRows = [] } = useQuery<{ title: string | null }>(
    cnoteSql || fallbackSql,
    cnoteSql ? [cnoteId!] : [],
  );

  if (!doc) return '새 탭';
  if (isCharacter) {
    if (charPrefix) return charRows[0]?.title?.trim() || '(이름 없음)';
    if (cnotePrefix) return cnoteRows[0]?.title?.trim() || '(제목 없음)';
    return '(알 수 없음)';
  }
  return generalRows[0]?.title?.trim() || '(제목 없음)';
}

interface MainTabBarProps {
  /** 활성 탭의 doc.section을 좌측 ActivityBar로 동기화 */
  onActiveSectionChange?: (section: WorkspaceSection | null) => void;
}

export function MainTabBar({ onActiveSectionChange }: MainTabBarProps) {
  const tabs = useMainTabsStore((s) => s.tabs);
  const activeTabId = useMainTabsStore((s) => s.activeTabId);
  const setActiveTab = useMainTabsStore((s) => s.setActiveTab);
  const closeTab = useMainTabsStore((s) => s.closeTab);
  const closeOthers = useMainTabsStore((s) => s.closeOthers);
  const closeRight = useMainTabsStore((s) => s.closeRight);
  const openBlankTab = useMainTabsStore((s) => s.openBlankTab);
  const reorderTabs = useMainTabsStore((s) => s.reorderTabs);
  const back = useMainTabsStore((s) => s.back);
  const forward = useMainTabsStore((s) => s.forward);
  const canBack = useMainTabsStore((s) => s.canBack());
  const canForward = useMainTabsStore((s) => s.canForward());

  const scrollerRef = useRef<HTMLDivElement>(null);

  // 활성 탭이 실제로 *교체*된 순간에만 ActivityBar 동기화
  // 같은 탭에서 doc.section 변경(사이드바 클릭으로 doc 교체 등)은 sync 하지 않음 →
  // 사용자가 ActivityBar로 다른 액티비티를 선택했을 때 즉시 덮어쓰지 않도록 보호
  const lastSyncedTabIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastSyncedTabIdRef.current === activeTabId) return;
    lastSyncedTabIdRef.current = activeTabId;
    const tab = useMainTabsStore
      .getState()
      .tabs.find((t) => t.id === activeTabId);
    onActiveSectionChange?.(tab?.doc?.section ?? null);
  }, [activeTabId, onActiveSectionChange]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = tabs.findIndex((t) => t.id === active.id);
    const newIdx = tabs.findIndex((t) => t.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(tabs, oldIdx, newIdx);
    reorderTabs(next.map((t) => t.id));
  };

  // 휠 deltaY → 가로 스크롤
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY === 0) return;
    if (!scrollerRef.current) return;
    scrollerRef.current.scrollLeft += e.deltaY;
  };

  const tabIds = useMemo(() => tabs.map((t) => t.id), [tabs]);

  if (tabs.length === 0) return null;

  return (
    <div className="flex shrink-0 items-center border-b border-border bg-muted/30">
      {/* back/forward */}
      <button
        type="button"
        onClick={back}
        disabled={!canBack}
        title="뒤로 (Alt+←)"
        aria-label="뒤로"
        className="flex h-8 w-7 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <ChevronLeft size={14} />
      </button>
      <button
        type="button"
        onClick={forward}
        disabled={!canForward}
        title="앞으로 (Alt+→)"
        aria-label="앞으로"
        className="flex h-8 w-7 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <ChevronRight size={14} />
      </button>

      {/* 탭 리스트 */}
      <div
        ref={scrollerRef}
        onWheel={handleWheel}
        className="scrollbar-none flex min-w-0 flex-1 overflow-x-auto"
      >
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <SortableContext items={tabIds} strategy={horizontalListSortingStrategy}>
            <div className="flex">
              {tabs.map((tab) => (
                <SortableTab
                  key={tab.id}
                  tab={tab}
                  active={tab.id === activeTabId}
                  onActivate={() => setActiveTab(tab.id)}
                  onClose={() => closeTab(tab.id)}
                  onCloseOthers={() => closeOthers(tab.id)}
                  onCloseRight={() => closeRight(tab.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      {/* 새 빈 탭 */}
      <button
        type="button"
        onClick={openBlankTab}
        title="새 탭 (Ctrl+T)"
        aria-label="새 탭"
        className="flex h-8 w-7 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

function SortableTab({
  tab,
  active,
  onActivate,
  onClose,
  onCloseOthers,
  onCloseRight,
}: {
  tab: MainTab;
  active: boolean;
  onActivate: () => void;
  onClose: () => void;
  onCloseOthers: () => void;
  onCloseRight: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: tab.id });
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const title = useTabTitle(tab.doc);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          style={style}
          {...attributes}
          {...listeners}
          onClick={onActivate}
          onAuxClick={(e) => {
            // 가운데 클릭 = 닫기
            if (e.button === 1) {
              e.preventDefault();
              onClose();
            }
          }}
          className={cn(
            'group flex h-8 min-w-25 max-w-50 shrink-0 cursor-pointer items-center gap-1.5 border-r border-border px-2 text-xs transition-colors',
            active
              ? 'bg-background text-foreground'
              : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
          )}
          data-tab-id={tab.id}
        >
          <FileText size={11} className="shrink-0 opacity-70" />
          <span className="min-w-0 flex-1 truncate">{title}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            title="닫기 (Ctrl+W)"
            aria-label="닫기"
            className={cn(
              'shrink-0 rounded p-0.5 transition-opacity hover:bg-destructive/15 hover:text-destructive',
              active ? 'opacity-70 hover:opacity-100' : 'opacity-0 group-hover:opacity-70',
            )}
          >
            <X size={11} />
          </button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onClose}>닫기</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={onCloseOthers}>다른 탭 모두 닫기</ContextMenuItem>
        <ContextMenuItem onSelect={onCloseRight}>오른쪽 탭 모두 닫기</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
