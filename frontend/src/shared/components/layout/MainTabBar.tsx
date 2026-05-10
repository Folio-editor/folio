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
  PanelRight,
  Plus,
  X,
} from 'lucide-react';
import { useRightPanelToggle } from './AppShell';
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
import { useDecryptedCharacterList } from '../../hooks/useDecryptedCharacter';
import { useDecryptedCharacterNoteList } from '../../hooks/useDecryptedCharacterNote';
import { useDecryptedPlanNoteList } from '../../hooks/useDecryptedPlanNote';
import { useDecryptedWorldNoteList } from '../../hooks/useDecryptedWorldNote';
import { useDecryptedPlotList } from '../../hooks/useDecryptedPlot';
import { useDecryptedForeshadowList } from '../../hooks/useDecryptedForeshadow';
import { useDecryptedIdeaArchiveList } from '../../hooks/useDecryptedIdeaArchive';
import {
  useDecryptedEpisodeList,
  type RawEpisodeListRow,
} from '../../hooks/useDecryptedEpisode';

// PR4: 탭 제목 컬럼은 v1: 접두사 ciphertext일 수 있어 모든 section은
// 해당 테이블의 work + JOIN으로 raw row를 가져와 batch decrypt 훅으로 평문 변환.
const FALLBACK_SQL = 'SELECT NULL AS title WHERE 0';

function useTabTitle(doc: MainDoc | null): string {
  const isCharacter = doc?.section === 'character';
  const charPrefix = isCharacter && doc?.itemId.startsWith('char:');
  const cnotePrefix = isCharacter && doc?.itemId.startsWith('cnote:');
  const charId = charPrefix ? doc!.itemId.slice(5) : null;
  const cnoteId = cnotePrefix ? doc!.itemId.slice(6) : null;
  const isAll = doc?.itemId === '__all__';

  const sec = !isCharacter && doc && !isAll ? doc.section : null;
  const id = !isCharacter && doc && !isAll ? doc.itemId : null;

  // episode.title도 v1: ciphertext일 수 있으므로 work JOIN + batch decrypt.
  const epSql = sec === 'episode' && id
    ? `SELECT e.id, e.work_id, e.title, e.status, e.word_count,
              e.sort_order, e.parent_id, e.created_at, e.updated_at,
              w.encrypted_dek AS encrypted_dek
       FROM episode e LEFT JOIN work w ON w.id = e.work_id
       WHERE e.id = ? LIMIT 1`
    : '';
  const { data: rawEpRows = [] } = useQuery<RawEpisodeListRow>(
    epSql || FALLBACK_SQL,
    epSql ? [id!] : [],
  );
  const { data: decEp } = useDecryptedEpisodeList(epSql ? rawEpRows : []);

  // PR4 — 각 테이블 work JOIN + batch decrypt 훅
  const planSql = sec === 'plan' && id
    ? `SELECT pn.id, pn.work_id, pn.writer_id, pn.title, pn.content,
              pn.sort_order, pn.created_at, pn.updated_at,
              w.encrypted_dek AS encrypted_dek
       FROM plan_note pn LEFT JOIN work w ON w.id = pn.work_id
       WHERE pn.id = ? LIMIT 1`
    : '';
  const { data: rawPlanRows = [] } = useQuery<{
    id: string; work_id: string; writer_id: string;
    title: string | null; content: string | null;
    sort_order: number | null; created_at: string; updated_at: string;
    encrypted_dek: string | null;
  }>(planSql || FALLBACK_SQL, planSql ? [id!] : []);
  const { data: decPlan } = useDecryptedPlanNoteList(planSql ? rawPlanRows : []);

  const wnSql = sec === 'world-note' && id
    ? `SELECT wn.id, wn.work_id, wn.writer_id, wn.parent_id, wn.name, wn.content,
              wn.sort_order, wn.created_at, wn.updated_at,
              w.encrypted_dek AS encrypted_dek
       FROM world_note wn LEFT JOIN work w ON w.id = wn.work_id
       WHERE wn.id = ? LIMIT 1`
    : '';
  const { data: rawWnRows = [] } = useQuery<{
    id: string; work_id: string; writer_id: string;
    parent_id: string | null; name: string | null; content: string | null;
    sort_order: number | null; created_at: string; updated_at: string;
    encrypted_dek: string | null;
  }>(wnSql || FALLBACK_SQL, wnSql ? [id!] : []);
  const { data: decWn } = useDecryptedWorldNoteList(wnSql ? rawWnRows : []);

  // plot은 자기 자신 + 부모(있으면) — 합성용. 한 번에 두 행 fetch.
  const plotSql = sec === 'plot' && id
    ? `SELECT p.id, p.work_id, p.writer_id, p.parent_id, p.title, p.status, p.content,
              p.sort_order, p.created_at, p.updated_at,
              w.encrypted_dek AS encrypted_dek, 0 AS is_parent
       FROM plot p LEFT JOIN work w ON w.id = p.work_id
       WHERE p.id = ?
       UNION ALL
       SELECT pp.id, pp.work_id, pp.writer_id, pp.parent_id, pp.title, pp.status, pp.content,
              pp.sort_order, pp.created_at, pp.updated_at,
              ww.encrypted_dek AS encrypted_dek, 1 AS is_parent
       FROM plot pp LEFT JOIN work ww ON ww.id = pp.work_id
       WHERE pp.id = (SELECT parent_id FROM plot WHERE id = ?)`
    : '';
  const { data: rawPlotRows = [] } = useQuery<{
    id: string; work_id: string; writer_id: string;
    parent_id: string | null; title: string | null; status: string | null; content: string | null;
    sort_order: number | null; created_at: string; updated_at: string;
    encrypted_dek: string | null; is_parent: number;
  }>(plotSql || FALLBACK_SQL, plotSql ? [id!, id!] : []);
  const { data: decPlot } = useDecryptedPlotList(
    plotSql
      ? rawPlotRows.map((r) => ({
          id: r.id, work_id: r.work_id, writer_id: r.writer_id,
          parent_id: r.parent_id, title: r.title, status: r.status, content: r.content,
          sort_order: r.sort_order, created_at: r.created_at, updated_at: r.updated_at,
          encrypted_dek: r.encrypted_dek,
        }))
      : [],
  );

  const foreSql = sec === 'foreshadow' && id
    ? `SELECT f.id, f.work_id, f.writer_id, f.title, f.status, f.importance, f.content,
              f.sort_order, f.created_at, f.updated_at,
              w.encrypted_dek AS encrypted_dek
       FROM foreshadow f LEFT JOIN work w ON w.id = f.work_id
       WHERE f.id = ? LIMIT 1`
    : '';
  const { data: rawForeRows = [] } = useQuery<{
    id: string; work_id: string; writer_id: string;
    title: string | null; status: string | null; importance: string | null; content: string | null;
    sort_order: number | null; created_at: string; updated_at: string;
    encrypted_dek: string | null;
  }>(foreSql || FALLBACK_SQL, foreSql ? [id!] : []);
  const { data: decFore } = useDecryptedForeshadowList(foreSql ? rawForeRows : []);

  const ideaSql = sec === 'idea-archive' && id
    ? `SELECT ia.id, ia.work_id, ia.writer_id, ia.content, ia.tag,
              ia.sort_order, ia.created_at, ia.updated_at,
              w.encrypted_dek AS encrypted_dek
       FROM idea_archive ia LEFT JOIN work w ON w.id = ia.work_id
       WHERE ia.id = ? LIMIT 1`
    : '';
  const { data: rawIdeaRows = [] } = useQuery<{
    id: string; work_id: string; writer_id: string;
    content: string | null; tag: string | null;
    sort_order: number | null; created_at: string; updated_at: string;
    encrypted_dek: string | null;
  }>(ideaSql || FALLBACK_SQL, ideaSql ? [id!] : []);
  const { data: decIdea } = useDecryptedIdeaArchiveList(ideaSql ? rawIdeaRows : []);

  // PR3 — character / character_note
  const charSql = charId
    ? `SELECT c.id, c.work_id, c.writer_id, c.name, c.gender, c.age,
              c.profile_image_url, c.sort_order, c.created_at, c.updated_at,
              w.encrypted_dek AS encrypted_dek
       FROM character c
       LEFT JOIN work w ON w.id = c.work_id
       WHERE c.id = ? LIMIT 1`
    : '';
  const cnoteSql = cnoteId
    ? `SELECT cn.id, cn.character_id, cn.writer_id, cn.kind, cn.title, cn.content,
              cn.sort_order, cn.created_at, cn.updated_at,
              c.work_id AS work_id, w.encrypted_dek AS encrypted_dek
       FROM character_note cn
       JOIN character c ON c.id = cn.character_id
       LEFT JOIN work w ON w.id = c.work_id
       WHERE cn.id = ? LIMIT 1`
    : '';
  const { data: rawCharRows = [] } = useQuery<{
    id: string; work_id: string; writer_id: string;
    name: string | null; gender: string | null; age: string | null;
    profile_image_url: string | null;
    sort_order: number | null; created_at: string; updated_at: string;
    encrypted_dek: string | null;
  }>(charSql || FALLBACK_SQL, charSql ? [charId!] : []);
  const { data: rawCnoteRows = [] } = useQuery<{
    id: string; character_id: string; writer_id: string; kind: string;
    title: string | null; content: string | null;
    sort_order: number | null; created_at: string; updated_at: string;
    work_id: string; encrypted_dek: string | null;
  }>(cnoteSql || FALLBACK_SQL, cnoteSql ? [cnoteId!] : []);
  const { data: decryptedChars } = useDecryptedCharacterList(charSql ? rawCharRows : []);
  const { data: decryptedCnotes } = useDecryptedCharacterNoteList(cnoteSql ? rawCnoteRows : []);

  if (!doc) return '새 탭';
  if (isAll) {
    if (doc.section === 'plot') return '전체 플롯';
    return '전체';
  }
  if (isCharacter) {
    if (charPrefix) return decryptedChars[0]?.name?.trim() || '(이름 없음)';
    if (cnotePrefix) return decryptedCnotes[0]?.title?.trim() || '(제목 없음)';
    return '(알 수 없음)';
  }
  if (sec === 'episode') return decEp[0]?.title?.trim() || '(제목 없음)';
  if (sec === 'plan') return decPlan[0]?.title?.trim() || '(제목 없음)';
  if (sec === 'world-note') return decWn[0]?.name?.trim() || '(제목 없음)';
  if (sec === 'plot') {
    const own = decPlot.find((_p, i) => rawPlotRows[i]?.is_parent === 0);
    const parent = decPlot.find((_p, i) => rawPlotRows[i]?.is_parent === 1);
    if (!own) return '(제목 없음)';
    const ownTitle = own.title?.trim() || '(제목 없음)';
    if (parent) {
      return `${parent.title?.trim() || '(제목 없음)'} / ${ownTitle}`;
    }
    return ownTitle;
  }
  if (sec === 'foreshadow') return decFore[0]?.title?.trim() || '(제목 없음)';
  if (sec === 'idea-archive') {
    // idea_archive는 content가 사실상 title — TipTap JSON일 수 있어 첫 텍스트 추출.
    const c = decIdea[0]?.content;
    if (!c) return '(메모 없음)';
    return extractIdeaPreview(c) || '(메모 없음)';
  }
  return '(제목 없음)';
}

function extractIdeaPreview(raw: string): string {
  // TipTap JSON 또는 평문일 수 있다. JSON이면 type=text 노드의 첫 chunk를 추출.
  try {
    const obj = JSON.parse(raw);
    const stack: unknown[] = [obj];
    while (stack.length > 0) {
      const cur = stack.pop() as { type?: string; text?: string; content?: unknown[] } | null;
      if (!cur) continue;
      if (cur.type === 'text' && typeof cur.text === 'string' && cur.text.trim()) {
        return cur.text.trim().slice(0, 60);
      }
      if (Array.isArray(cur.content)) stack.push(...cur.content);
    }
    return raw.slice(0, 60);
  } catch {
    return raw.trim().slice(0, 60);
  }
}

interface MainTabBarProps {
  /** 활성 탭의 doc.section을 좌측 ActivityBar로 동기화 */
  onActiveSectionChange?: (section: WorkspaceSection | null) => void;
}

export function MainTabBar({ onActiveSectionChange }: MainTabBarProps) {
  // 작품별 탭 분리 모델 — 화면엔 현재 작품(currentWorkId)의 탭만 노출.
  const allTabs = useMainTabsStore((s) => s.tabs);
  const currentWorkId = useMainTabsStore((s) => s.currentWorkId);
  const activeTabIdByWork = useMainTabsStore((s) => s.activeTabIdByWork);
  const tabs = useMemo(
    () => (currentWorkId ? allTabs.filter((t) => t.workId === currentWorkId) : []),
    [allTabs, currentWorkId],
  );
  const activeTabId: string | null = currentWorkId
    ? activeTabIdByWork[currentWorkId] ?? null
    : null;
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
  const rightPanel = useRightPanelToggle();

  if (tabs.length === 0) return null;

  return (
    <div className="flex h-10 shrink-0 items-stretch bg-muted/40">
      {/* back/forward — 비활성 탭과 동일한 border/hover 토큰으로 통일 (시각 일치) */}
      <button
        type="button"
        onClick={back}
        disabled={!canBack}
        title="뒤로 (Alt+←)"
        aria-label="뒤로"
        className="flex w-8 shrink-0 items-center justify-center border-b border-r border-border text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <ChevronLeft size={14} />
      </button>
      <button
        type="button"
        onClick={forward}
        disabled={!canForward}
        title="앞으로 (Alt+→)"
        aria-label="앞으로"
        className="flex w-8 shrink-0 items-center justify-center border-b border-r border-border text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <ChevronRight size={14} />
      </button>

      {/* 탭 리스트 + 마지막 탭 옆 + 버튼 */}
      <div
        ref={scrollerRef}
        onWheel={handleWheel}
        className="scrollbar-none flex min-w-0 flex-1 items-stretch overflow-x-auto"
      >
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <SortableContext items={tabIds} strategy={horizontalListSortingStrategy}>
            <div className="flex items-stretch">
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
              {/* + 새 탭 — 마지막 탭 우측에 인라인 */}
              <button
                type="button"
                onClick={openBlankTab}
                title="새 탭 (Ctrl+T)"
                aria-label="새 탭"
                className="flex w-8 shrink-0 items-center justify-center border-b border-border text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
              >
                <Plus size={14} />
              </button>
            </div>
          </SortableContext>
        </DndContext>
        {/* 탭 + + 버튼 이후 빈 영역 — bottom border 유지 */}
        <div className="flex-1 border-b border-border" />
      </div>

      {/* 우측 패널 토글 — 탭바 제일 우측 */}
      {rightPanel && (
        <button
          type="button"
          onClick={rightPanel.toggle}
          title={`보조 패널 ${rightPanel.visible ? '닫기' : '열기'} (Ctrl+Shift+B)`}
          aria-label="보조 패널 토글"
          className={cn(
            'flex w-9 shrink-0 items-center justify-center border-b border-border transition-colors',
            rightPanel.visible
              ? 'text-primary'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
        >
          <PanelRight size={15} strokeWidth={1.75} />
        </button>
      )}
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
            'group flex min-w-25 max-w-50 shrink-0 cursor-pointer items-center gap-1.5 border-r border-border px-3 text-xs transition-colors',
            // 활성 탭: 본문 색상으로 강조 + 라인은 동일 (민무늬 연결 X)
            // 비활성 탭: 컨테이너 muted + 라인 유지
            'border-b border-border',
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
