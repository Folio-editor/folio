import { useState, useEffect, useCallback, useRef } from 'react';
import { usePowerSync } from '@powersync/react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core';

// 통합 뷰의 TipTap 본문 텍스트 선택/편집과 dnd-kit 드래그 충돌 방지
// input/textarea/select/[contenteditable] 위에서 PointerDown은 드래그 트리거에서 제외
class SmartPointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: ({ nativeEvent }: { nativeEvent: PointerEvent }) => {
        const target = nativeEvent.target as HTMLElement | null;
        if (target?.closest('input, textarea, select, [contenteditable]')) {
          return false;
        }
        return true;
      },
    },
  ];
}
import { arrayMove } from '@dnd-kit/sortable';
import { useDragZoneStore } from '../../lib/dragZoneStore';
import { useOptimisticMoveStore } from '../../lib/optimisticMoveStore';
import { useMainTabsStore } from '../../stores/mainTabsStore';
import { AppShell } from '../../components/layout/AppShell';
import { ActivityBar } from '../../components/layout/ActivityBar';
import { SecondarySidebar } from '../../components/layout/SecondarySidebar';
import { RightPanels } from '../../components/layout/RightPanels';
import { MainTabBar } from '../../components/layout/MainTabBar';
import { WorkspaceHomeOverview } from '../workspace/WorkspaceHomeOverview';
import { WorkspaceHomeScreen } from '../workspace/WorkspaceHomeScreen';
import { EmptyMainState } from '../workspace/EmptyMainState';
import { PlanSectionShell } from '../plan/PlanSectionShell';
import { WorldNoteHierarchyScreen } from '../world-note/WorldNoteHierarchyScreen';
import { CharacterOverview } from '../character/CharacterOverview';
import { CharacterNoteEditor } from '../character/CharacterNoteEditor';
import { PlotOverview } from '../plot/PlotOverview';
import { EpisodeEditScreen } from '../episode/EpisodeEditScreen';
import { ForeshadowEditScreen } from '../foreshadow/ForeshadowEditScreen';
import { IdeaArchiveEditScreen } from '../idea-archive/IdeaArchiveEditScreen';
import { TrashScreen } from '../trash/TrashScreen';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { useSyncResolver } from '../../hooks/useSyncResolver';
import { usePersistentState } from '../../hooks/usePersistentState';
import { SyncDecisionDialog } from './SyncDecisionDialog';
import { SettingsScreen } from '../settings/SettingsScreen';
import type { SettingsItemId } from '../../components/layout/sidebar-panels/SettingsList';
import {
  Activity, WorkspaceSection, AuxPanelItem, AUX_DRAG_MIME,
  type RightPanelTab, type ClickIntent, type MainDoc,
  docTypeToRoute, currentDocToAuxItem,
} from '../../types/workspace';

const SIDEBAR_MIN = 180;
const RIGHT_PANEL_MIN = 200;
// MAX 절대 상한은 두지 않는다 — 뷰포트 기반 동적 MAX 로 메인 패널 최소 너비만 보장.
const ACTIVITY_BAR_W = 56;
const MAIN_MIN_W = 320;

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

/**
 * 메인 에디터 화면 — Stage Manager 단순화 모델.
 *
 * 상태 모델:
 * - activity: 좌측 사이드바 뷰만 결정 (메인과 무관)
 * - selectedWorkId: 현재 작품
 * - mainDoc: 메인 스테이지 1슬롯 (section + itemId)
 * - auxPinned: 우측 서브 스테이지 N슬롯 (명시적 X로만 제거)
 *
 * 클릭 디스패치 (handleSidebarClick):
 * - default (단일 클릭): 메인에 즉시 열기 — 현 메인은 교체됨
 * - pin (더블 / ⌘+Click / 드래그): 우측 서브 스테이지에 적층
 *
 * 메인 보존이 필요하면 메인 헤더의 ↗(우측으로 보내기)를 먼저 누른 뒤 다음 항목 선택.
 *
 * useSyncResolver는 로그인 직후 sync 의사결정을 자동/수동으로 처리한다.
 */
export function AuthenticatedApp() {
  const db = usePowerSync();
  const [activity, setActivity] = useState<Activity>('home');
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(null);
  // 메인 다중 탭 store — 활성 탭 doc이 mainDoc 역할 (단일 슬롯 호환)
  const tabs = useMainTabsStore((s) => s.tabs);
  const activeTabId = useMainTabsStore((s) => s.activeTabId);
  const replaceActive = useMainTabsStore((s) => s.replaceActive);
  const openTab = useMainTabsStore((s) => s.openTab);
  const closeAllTabs = useMainTabsStore((s) => s.closeAll);
  const closeActiveTab = useMainTabsStore((s) => s.closeTab);
  const hydrateLegacyMainDoc = useMainTabsStore((s) => s.hydrateLegacyMainDoc);
  const mainDoc: MainDoc | null =
    tabs.find((t) => t.id === activeTabId)?.doc ?? null;
  /** 활성 탭 doc 교체 (없으면 새 탭). null 전달 시 활성 탭 닫기 — 기존 setMainDoc(null) 호환 */
  const setMainDoc = useCallback(
    (next: MainDoc | null) => {
      if (next === null) {
        if (activeTabId) closeActiveTab(activeTabId);
        return;
      }
      replaceActive(next);
    },
    [activeTabId, closeActiveTab, replaceActive],
  );
  // legacy 'folio.ui.mainDoc' 키 마이그레이션 (1회)
  useEffect(() => {
    hydrateLegacyMainDoc();
  }, [hydrateLegacyMainDoc]);
  // stale 탭 정리 — 영속에는 있지만 DB에서 삭제된 노드 (1회, 마운트 직후)
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const state = useMainTabsStore.getState();
      const docs = state.tabs
        .map((t) => t.doc)
        .filter((d): d is MainDoc => d !== null);
      if (docs.length === 0) return;
      // section별 itemId 검증 — character는 prefix 분리
      const validIds = new Set<string>();
      const sectionTable: Record<WorkspaceSection, string> = {
        episode: 'episode',
        'world-note': 'world_note',
        plan: 'plan_note',
        plot: 'plot',
        foreshadow: 'foreshadow',
        character: 'character',
        'idea-archive': 'idea_archive',
      };
      for (const doc of docs) {
        let table = sectionTable[doc.section];
        let id = doc.itemId;
        if (doc.section === 'character') {
          if (id.startsWith('cnote:')) {
            table = 'character_note';
            id = id.slice(6);
          } else if (id.startsWith('char:')) {
            table = 'character';
            id = id.slice(5);
          } else continue;
        }
        try {
          const rows = await db.getAll<{ id: string }>(
            `SELECT id FROM ${table} WHERE id = ? LIMIT 1`,
            [id],
          );
          if (rows.length > 0) validIds.add(`${doc.section}:${doc.itemId}`);
        } catch {
          // 테이블 미존재 등 — 검증 실패 시 보존 (false-positive 방지)
          validIds.add(`${doc.section}:${doc.itemId}`);
        }
      }
      if (cancelled) return;
      useMainTabsStore.getState().pruneStaleTabs((doc) =>
        validIds.has(`${doc.section}:${doc.itemId}`),
      );
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db]);
  const [settingsMode, setSettingsMode] = useState(false);
  const [selectedSettingsItem, setSelectedSettingsItem] = useState<SettingsItemId | null>(null);
  const resolver = useSyncResolver();

  const {
    createWork,
    createWorldNote,
    createPlanNote,
    ensureWorldNoteTemplates,
    placeWorldNote,
    placePlot,
    placePlanNote,
    placeEpisode,
    placeForeshadow,
    placeIdea,
    placeWork,
    placeCharacter,
    placeCharacterNote,
  } = useLocalWrite();

  // 세계관 탭 진입 시 기본 템플릿 자동 생성
  useEffect(() => {
    if (activity === 'world-note' && selectedWorkId) {
      void ensureWorldNoteTemplates(selectedWorkId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity, selectedWorkId]);

  // 레이아웃 상태 — localStorage 에 영속
  const [sidebarWidth, setSidebarWidth] = usePersistentState(
    'folio.ui.sidebarWidth',
    256,
  );
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistentState(
    'folio.ui.sidebarCollapsed',
    false,
  );
  const [rightPanelsWidth, setRightPanelsWidth] = usePersistentState(
    'folio.ui.rightPanelsWidth',
    288,
  );

  // ── 우측 서브 스테이지 (핀 슬롯) ──
  // auxPinned: 영속, key는 backward-compat로 'folio.ui.auxPanels' 그대로 유지
  const [auxPinned, setAuxPinned] = usePersistentState<AuxPanelItem[]>(
    'folio.ui.auxPanels',
    [],
  );
  const [isDraggingDoc, setIsDraggingDoc] = useState(false);
  const [rightPanelVisible, setRightPanelVisible] = usePersistentState(
    'folio.ui.rightPanelVisible',
    false,
  );
  const [rightPanelTab, setRightPanelTab] = usePersistentState<RightPanelTab>(
    'folio.ui.rightPanelTab',
    'docs',
  );
  const toggleRightPanel = useCallback(
    () => setRightPanelVisible((v) => !v),
    [setRightPanelVisible],
  );

  // 핀 슬롯 조작
  const addPinned = useCallback(
    (item: Omit<AuxPanelItem, 'id' | 'collapsed'>, index?: number) => {
      setAuxPinned((prev) => {
        if (prev.some((p) => p.docType === item.docType && p.docId === item.docId)) return prev;
        const newItem = { ...item, id: crypto.randomUUID(), collapsed: false };
        if (index !== undefined && index >= 0 && index <= prev.length) {
          const next = [...prev];
          next.splice(index, 0, newItem);
          return next;
        }
        return [...prev, newItem];
      });
    },
    [setAuxPinned],
  );
  const removePinned = useCallback(
    (panelId: string) =>
      setAuxPinned((prev) => prev.filter((p) => p.id !== panelId)),
    [setAuxPinned],
  );
  const reorderPinned = useCallback(
    (reordered: AuxPanelItem[]) => setAuxPinned(reordered),
    [setAuxPinned],
  );
  const togglePinnedCollapse = useCallback(
    (panelId: string) =>
      setAuxPinned((prev) =>
        prev.map((p) => (p.id === panelId ? { ...p, collapsed: !p.collapsed } : p)),
      ),
    [setAuxPinned],
  );

  // 드래그 시 자동으로 우측 패널 표시 + 핀 적층
  const addPinnedAndShow = useCallback(
    (item: Omit<AuxPanelItem, 'id' | 'collapsed'>, index?: number) => {
      if (!rightPanelVisible) setRightPanelVisible(true);
      addPinned(item, index);
    },
    [rightPanelVisible, setRightPanelVisible, addPinned],
  );

  // ── 메인 ↔ 우측 패널 swap 원위치 추적 ──
  // "본문으로 열기"로 메인이 된 패널의 직전 우측 인덱스를 ref에 보관 →
  // 직후 "우측 패널로 보내기" 시 그 위치로 복귀. 그 외 경로로 메인이 바뀌면 무효화.
  const lastMainOriginIndexRef = useRef<number | null>(null);
  const pendingOriginPanelIdRef = useRef<string | null>(null);

  // 특정 (section, itemId) 의 제목을 로컬 DB에서 조회
  const fetchItemTitle = useCallback(
    async (section: WorkspaceSection, itemId: string): Promise<string> => {
      const TITLE_QUERIES: Partial<Record<WorkspaceSection, { sql: string; id: string }>> = {
        'episode':    { sql: 'SELECT title FROM episode WHERE id = ?',            id: itemId },
        'world-note': { sql: 'SELECT name AS title FROM world_note WHERE id = ?', id: itemId },
        'plan':       { sql: 'SELECT title FROM plan_note WHERE id = ?',          id: itemId },
        'foreshadow': { sql: 'SELECT title FROM foreshadow WHERE id = ?',         id: itemId },
        'character':  itemId.startsWith('cnote:')
          ? { sql: 'SELECT title FROM character_note WHERE id = ?', id: itemId.slice(6) }
          : itemId.startsWith('char:')
            ? { sql: 'SELECT name AS title FROM character WHERE id = ?', id: itemId.slice(5) }
            : undefined,
      };
      const q = TITLE_QUERIES[section];
      if (!q) return '';
      try {
        const result = await db.execute(q.sql, [q.id]);
        return (result.rows?._array as { title: string }[])?.[0]?.title ?? '';
      } catch {
        return '';
      }
    },
    [db],
  );

  // ── 사이드바 클릭 디스패처 (단순화) ──
  // default(단일): 활성 탭 교체 / newTab(⌘+클릭): 새 탭 / pin(더블): 우측 핀 적층
  const handleSidebarClick = useCallback(
    async (section: WorkspaceSection, itemId: string, intent: ClickIntent) => {
      if (intent === 'pin') {
        const title = await fetchItemTitle(section, itemId);
        const aux = currentDocToAuxItem(section, itemId, title);
        if (aux) addPinnedAndShow(aux, 0);
        return;
      }
      if (intent === 'newTab') {
        openTab({ section, itemId });
        return;
      }
      // default — 활성 탭 doc 교체 (중복 시 점프, 활성 없으면 새 탭)
      replaceActive({ section, itemId });
    },
    [replaceActive, openTab, addPinnedAndShow, fetchItemTitle],
  );

  // 우측 핀의 ↗(본문으로 열기) — 핀과 메인 swap (자리 교환)
  // 현 메인을 클릭된 패널의 자리(원래 인덱스)로 보존 + 대상 패널을 메인으로 승격
  // 새 메인의 원위치는 ref에 기록 → 직후 "우측 보내기" 시 그 위치로 복귀
  const handleOpenInMain = useCallback(
    async (panel: AuxPanelItem) => {
      const route = docTypeToRoute(panel.docType, panel.docId);
      if (!route || !route.itemId) return;

      const targetIdx = auxPinned.findIndex((p) => p.id === panel.id);
      const insertIdx = targetIdx >= 0 ? targetIdx : 0;

      if (mainDoc) {
        const currentTitle = await fetchItemTitle(mainDoc.section, mainDoc.itemId);
        const currentAux = currentDocToAuxItem(mainDoc.section, mainDoc.itemId, currentTitle);
        if (currentAux) addPinned(currentAux, insertIdx);
      }

      lastMainOriginIndexRef.current = insertIdx;
      pendingOriginPanelIdRef.current = route.itemId;

      setActivity(route.activity);
      setMainDoc({ section: route.section, itemId: route.itemId });
      removePinned(panel.id);
    },
    [mainDoc, auxPinned, fetchItemTitle, addPinned, removePinned, setMainDoc],
  );

  // 메인이 swap 외 경로(사이드바 클릭/새 문서/네비게이션 등)로 바뀌면 origin 무효화
  // pendingOriginPanelIdRef가 새 mainDoc.itemId와 일치할 때만 1회 보존 핸드오프
  useEffect(() => {
    const expected = pendingOriginPanelIdRef.current;
    if (expected && mainDoc?.itemId === expected) {
      pendingOriginPanelIdRef.current = null;
      return;
    }
    lastMainOriginIndexRef.current = null;
    pendingOriginPanelIdRef.current = null;
  }, [mainDoc?.section, mainDoc?.itemId]);

  // 단축키: Ctrl+Shift+B → 우측 패널 토글
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'B') {
        e.preventDefault();
        toggleRightPanel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [toggleRightPanel]);

  // 메인 탭 단축키 — Ctrl+W/T/Tab/1-9, Alt+←→
  useEffect(() => {
    const isInEditableField = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (target.isContentEditable) return true;
      return false;
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const inEditable = isInEditableField(e.target);

      // Ctrl+W — 활성 탭 닫기 (edit field 안에서도 동작 — 입력 방해 X)
      if (mod && !e.shiftKey && !e.altKey && (e.key === 'w' || e.key === 'W')) {
        e.preventDefault();
        const { activeTabId, closeTab } = useMainTabsStore.getState();
        if (activeTabId) closeTab(activeTabId);
        return;
      }
      // Ctrl+T — 새 빈 탭
      if (mod && !e.shiftKey && !e.altKey && (e.key === 't' || e.key === 'T')) {
        e.preventDefault();
        useMainTabsStore.getState().openBlankTab();
        return;
      }
      // Ctrl+Tab / Ctrl+Shift+Tab — 다음/이전 탭
      if (mod && e.key === 'Tab') {
        e.preventDefault();
        const state = useMainTabsStore.getState();
        if (state.tabs.length === 0) return;
        const idx = state.tabs.findIndex((t) => t.id === state.activeTabId);
        const dir = e.shiftKey ? -1 : 1;
        const next = (idx + dir + state.tabs.length) % state.tabs.length;
        state.setActiveTab(state.tabs[next].id);
        return;
      }
      // Ctrl+PageDown / Ctrl+PageUp — fallback (일부 환경에서 Ctrl+Tab 캡쳐 시)
      if (mod && (e.key === 'PageDown' || e.key === 'PageUp')) {
        e.preventDefault();
        const state = useMainTabsStore.getState();
        if (state.tabs.length === 0) return;
        const idx = state.tabs.findIndex((t) => t.id === state.activeTabId);
        const dir = e.key === 'PageDown' ? 1 : -1;
        const next = (idx + dir + state.tabs.length) % state.tabs.length;
        state.setActiveTab(state.tabs[next].id);
        return;
      }
      // Ctrl+1..9 — 인덱스 탭 (Numpad 포함 e.code 기반)
      if (mod && !e.shiftKey && !e.altKey) {
        const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
        if (m) {
          e.preventDefault();
          const targetIdx = Number(m[1]) - 1;
          const state = useMainTabsStore.getState();
          const tab = state.tabs[targetIdx];
          if (tab) state.setActiveTab(tab.id);
          return;
        }
      }
      // Alt+Left / Alt+Right — back/forward (편집 필드에서는 단어 단위 이동이라 skip)
      if (e.altKey && !mod && !e.shiftKey && !inEditable) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          useMainTabsStore.getState().back();
          return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          useMainTabsStore.getState().forward();
          return;
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 문서 드래그 감지 — 패널 0개일 때도 드롭 존 표시
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes(AUX_DRAG_MIME)) setIsDraggingDoc(true);
    };
    const onDragEnd = () => setIsDraggingDoc(false);
    const onDrop = () => setIsDraggingDoc(false);
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('dragend', onDragEnd);
    document.addEventListener('drop', onDrop);
    return () => {
      document.removeEventListener('dragover', onDragOver);
      document.removeEventListener('dragend', onDragEnd);
      document.removeEventListener('drop', onDrop);
    };
  }, []);

  // 뷰포트 기반 동적 MAX 계산 — 메인 패널 최소 너비(MAIN_MIN_W) 보장.
  // 사용자가 사이드바를 자유롭게 넓힐 수 있되, 메인이 0이 되지는 않도록.
  const sidebarMaxAllowed = () =>
    Math.max(
      SIDEBAR_MIN,
      window.innerWidth - rightPanelsWidth - ACTIVITY_BAR_W - MAIN_MIN_W,
    );
  const rightPanelMaxAllowed = () =>
    Math.max(
      RIGHT_PANEL_MIN,
      window.innerWidth - sidebarWidth - ACTIVITY_BAR_W - MAIN_MIN_W,
    );

  const resizeSidebar = (delta: number) =>
    setSidebarWidth((w) => clamp(w + delta, SIDEBAR_MIN, sidebarMaxAllowed()));
  const resizeRightPanels = (delta: number) =>
    setRightPanelsWidth((w) => clamp(w + delta, RIGHT_PANEL_MIN, rightPanelMaxAllowed()));

  // ── 액티비티 / 작품 / 섹션 핸들러 ──
  // 핵심 변경: handleActivityChange는 mainDoc을 건드리지 않는다 (Stage Manager 모델)
  const handleActivityChange = (next: Activity) => {
    // 같은 액티비티 + 사이드바 열림 + 설정 모드 아님 → 사이드바 닫기 토글
    if (!sidebarCollapsed && activity === next && !settingsMode) {
      setSidebarCollapsed(true);
      return;
    }
    if (sidebarCollapsed) setSidebarCollapsed(false);
    setSettingsMode(false);
    setSelectedSettingsItem(null);
    setActivity(next);
    // mainDoc은 보존 — 사이드바 뷰만 갱신
  };

  const handleSettingsClick = () => {
    // 이미 설정 모드 + 사이드바 열림 → 닫기 토글
    if (!sidebarCollapsed && settingsMode) {
      setSidebarCollapsed(true);
      return;
    }
    if (sidebarCollapsed) setSidebarCollapsed(false);
    setSettingsMode(true);
    setSelectedSettingsItem('account');
  };

  const handleWorkSelect = (id: string) => {
    setSelectedWorkId(id);
    // 작품 전환 = 작업 컨텍스트 전환 → 모든 탭 닫기
    closeAllTabs();
  };

  // WorkspaceHomeScreen에서 섹션 카드 클릭 — 사이드바 뷰만 전환 (메인 보존)
  const handleSectionSelect = (section: WorkspaceSection) => {
    setActivity(section);
  };

  const handleNewWork = async (title: string) => {
    const id = await createWork(title);
    setSelectedWorkId(id);
    closeAllTabs();
    setSidebarCollapsed(false);
    setActivity('home');
  };

  const handleNewWorldNote = async (parentId?: string | null) => {
    if (!selectedWorkId) return;
    const id = await createWorldNote(selectedWorkId, '새 문서', Date.now(), parentId);
    // child든 root든 새 노트 id를 mainDoc.itemId로 — Hierarchy 화면이 parent_id로 root 결정 + child면 자동 focus
    setMainDoc({ section: 'world-note', itemId: id });
    setSidebarCollapsed(false);
    setActivity('world-note');
  };

  const handleNewPlanNote = async () => {
    if (!selectedWorkId) return;
    const id = await createPlanNote(selectedWorkId, '새 문서', Date.now());
    setMainDoc({ section: 'plan', itemId: id });
    setSidebarCollapsed(false);
    setActivity('plan');
  };

  const handleNewWorkReset = () => {
    setSelectedWorkId(null);
    closeAllTabs();
    setSidebarCollapsed(false);
    setActivity('home');
  };

  const handleWorkDeleted = () => {
    setSelectedWorkId(null);
    closeAllTabs();
    setAuxPinned([]);
    setSidebarCollapsed(false);
    setActivity('home');
  };

  /** 크로스 섹션 네비게이션 — 플롯↔원고 연결 이동 등 */
  const handleNavigateTo = (section: WorkspaceSection, itemId: string | null) => {
    setActivity(section);
    setMainDoc(itemId ? { section, itemId } : null);
  };

  // 메인 ✕ — 메인을 즉시 비움 (현 문서는 사라짐. 보존하려면 ↗ 사용)
  const handleCloseMain = useCallback(() => {
    setMainDoc(null);
  }, [setMainDoc]);

  // 메인 ↗ — 현 문서를 핀으로 옮기고 메인 비움
  // 메인이 직전 "본문으로 열기"로 들어왔으면 그 원위치로 복귀, 아니면 최상단
  const handleSendMainToRight = useCallback(async () => {
    if (!mainDoc) return;
    const title = await fetchItemTitle(mainDoc.section, mainDoc.itemId);
    const aux = currentDocToAuxItem(mainDoc.section, mainDoc.itemId, title);
    const targetIdx = lastMainOriginIndexRef.current ?? 0;
    if (aux) addPinnedAndShow(aux, targetIdx);
    lastMainOriginIndexRef.current = null;
    pendingOriginPanelIdRef.current = null;
    setMainDoc(null);
  }, [mainDoc, fetchItemTitle, addPinnedAndShow, setMainDoc]);

  // ── 통합 DndContext: 좌측 트리 ↔ 우측 사이드바 cross-component drag ──
  // SmartPointerSensor: input/textarea/contenteditable 위에서는 드래그 비활성
  // → 통합 뷰의 TipTap 본문 텍스트 선택/편집과 충돌 방지 (사이드바엔 해당 영역 없음)
  const dndSensors = useSensors(
    useSensor(SmartPointerSensor, { activationConstraint: { distance: 8 } }),
  );
  const setDragZone = useDragZoneStore((s) => s.set);
  const clearDragZone = useDragZoneStore((s) => s.clear);
  const addOptimisticMove = useOptimisticMoveStore((s) => s.addMove);
  const clearOptimisticMove = useOptimisticMoveStore((s) => s.clearMove);
  // 드래그 중인 노드 미리보기 정보 — DragOverlay용
  const [activeDrag, setActiveDrag] = useState<{ title: string } | null>(null);

  const handleDndStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as { type?: string; title?: string } | undefined;
    if (data?.type === 'tree-node') {
      setActiveDrag({ title: data.title ?? '' });
    } else {
      setActiveDrag(null);
    }
  }, []);

  // onDragMove에서 마우스 Y 위치로 zone(before/merge/after) 계산 → store로 시각 피드백
  const handleDndMove = useCallback(
    (event: DragMoveEvent) => {
      const { over, active, activatorEvent, delta } = event;
      if (!over) {
        setDragZone(null, null);
        return;
      }
      const overData = over.data.current as
        | {
            type?: string;
            docType?: string;
            depth?: number;
            characterId?: string;
            lastItemId?: string | null;
          }
        | undefined;
      const activeData = active.data.current as
        | { type?: string; docType?: string; docId?: string; characterId?: string }
        | undefined;
      // tree-root-end (트리 끝 빈 영역) hover 시: 마지막 노드의 after 밑줄로 시각 표시
      if (overData?.type === 'tree-root-end') {
        if (activeData?.type !== 'tree-node') {
          setDragZone(null, null);
          return;
        }
        if (activeData.docType !== overData.docType) {
          setDragZone(null, null);
          return;
        }
        const lastId = overData.lastItemId;
        // 자기 자신이 마지막이면 시각 표시 무의미
        if (!lastId || lastId === activeData.docId) {
          setDragZone(null, null);
          return;
        }
        setDragZone(lastId, 'after');
        return;
      }
      // 트리 노드끼리만 zone 표시 (panel→tree, aux-area 등은 시각 피드백 X)
      if (overData?.type !== 'tree-node' || activeData?.type !== 'tree-node') {
        setDragZone(null, null);
        return;
      }
      // cross-docType drag: 어차피 handleDndEnd에서 무시되므로 시각 피드백도 차단
      if (activeData.docType !== overData.docType) {
        setDragZone(null, null);
        return;
      }
      // character_note: cross-character drop 차단 (같은 character 안에서만)
      if (
        overData.docType === 'character_note' &&
        activeData.characterId !== overData.characterId
      ) {
        setDragZone(null, null);
        return;
      }
      // 자기 자신 위 drop 차단 (시각 피드백 불필요)
      if (active.id === over.id) {
        setDragZone(null, null);
        return;
      }
      const rect = over.rect;
      const pointerEvent = activatorEvent as PointerEvent;
      const currentY = pointerEvent.clientY + delta.y;
      const ratio = (currentY - rect.top) / rect.height;
      // merge zone 활성 조건:
      // - world_note: 무제한 깊이 → 항상 활성
      // - plot: 막(depth=0)에서만 (회차 위 병합 차단)
      // - 평탄 리스트들: merge 불가 (자식 개념 없음) → before/after만
      const overDocType = overData.docType;
      const mergeAllowed =
        overDocType === 'world_note' ||
        (overDocType === 'plot' && (overData.depth ?? 0) < 1);
      // zone 비율: before 40% / merge 20% / after 40%
      // — merge는 행 정중앙의 좁은 영역에서만 활성, 나머지는 정렬로 명확히 분리
      let zone: 'before' | 'merge' | 'after';
      if (!mergeAllowed) {
        zone = ratio < 0.5 ? 'before' : 'after';
      } else if (ratio < 0.4) zone = 'before';
      else if (ratio > 0.6) zone = 'after';
      else zone = 'merge';
      // store overId는 raw docId — 사이드바/통합 뷰가 동일 raw id로 비교 가능
      const overDocId = (overData as { docId?: string }).docId ?? String(over.id);
      setDragZone(overDocId, zone);
    },
    [setDragZone],
  );

  // onDragEnd 분기: aux-area / panel sortable / tree-node-drop
  const handleDndEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      const zone = useDragZoneStore.getState().zone;
      clearDragZone();
      setActiveDrag(null);
      if (!over) return;

      const activeData = active.data.current as
        | { type?: string; docType?: string; docId?: string; depth?: number; parentId?: string | null }
        | undefined;
      const overData = over.data.current as
        | { type?: string; docType?: string; docId?: string; depth?: number; parentId?: string | null }
        | undefined;

      // 1) 우측 사이드바 영역에 트리 노드 드롭 → 패널 추가
      // 단 'work'는 작품 자체이므로 우측 패널 보내기 X
      if (over.id === 'aux-pinned-area' && activeData?.type === 'tree-node') {
        if (activeData.docType === 'work') return;
        const docType = activeData.docType as AuxPanelItem['docType'];
        const docId = activeData.docId as string;
        const title = (activeData as { title?: string }).title ?? '';
        addPinnedAndShow({ docType, docId, title }, 0);
        return;
      }

      // 1-b) 트리 끝 빈 영역(root-end) → 그룹의 마지막 자식으로
      if (overData?.type === 'tree-root-end' && activeData?.type === 'tree-node') {
        if (activeData.docType !== overData.docType) return;
        if (!activeData.docType) return;
        const docType = activeData.docType;
        // sortable id가 prefix될 수 있으므로 raw docId 사용
        const activeId = activeData.docId as string;
        const activeDepth = (activeData as { depth?: number }).depth ?? 0;
        const workId = (activeData as { workId?: string }).workId;
        const characterId = (activeData as { characterId?: string }).characterId;
        const rowSnapshot =
          (activeData as { rowSnapshot?: Record<string, unknown> }).rowSnapshot ?? {};
        // plot은 막→회차 2단 의도된 구조 — 회차(depth=1)를 root-end에 drop하면 막이 됨 = 차단
        if (docType === 'plot' && activeDepth >= 1) return;
        // character_note는 같은 character 안에서만 정렬 — root-end는 character 그룹 외 = 차단
        if (docType === 'character_note') return;

        // root-end는 그룹 마지막 — 새 sortOrder는 큰 수 (Date.now())
        const newSortOrder = Date.now();
        // root-end의 newParentId: world_note/plot은 null. 평탄 리스트는 parent_id 자체 X (undefined)
        const hasParentField = docType === 'world_note' || docType === 'plot';
        addOptimisticMove({
          docId: activeId,
          docType,
          newSortOrder,
          newParentId: hasParentField ? null : undefined,
          rowSnapshot,
        });

        const run = async () => {
          try {
            if (docType === 'world_note') {
              await placeWorldNote(activeId, null, null, 'end');
            } else if (docType === 'plot') {
              await placePlot(activeId, null, null, 'end');
            } else if (docType === 'plan_note' && workId) {
              await placePlanNote(activeId, workId, null, 'end');
            } else if (docType === 'episode' && workId) {
              await placeEpisode(activeId, workId, null, 'end');
            } else if (docType === 'foreshadow' && workId) {
              await placeForeshadow(activeId, workId, null, 'end');
            } else if (docType === 'idea_archive' && workId) {
              await placeIdea(activeId, workId, null, 'end');
            } else if (docType === 'work') {
              await placeWork(activeId, null, 'end');
            } else if (docType === 'character' && workId) {
              await placeCharacter(activeId, workId, null, 'end');
            } else if (docType === 'character_note' && characterId) {
              await placeCharacterNote(activeId, characterId, null, 'end');
            }
          } finally {
            clearOptimisticMove(activeId);
          }
        };
        void run();
        return;
      }

      // 2) 우측 사이드바 panel sortable reorder
      if (activeData?.type === 'panel' && overData?.type === 'panel') {
        if (active.id === over.id) return;
        const oldIdx = auxPinned.findIndex((p) => p.id === active.id);
        const newIdx = auxPinned.findIndex((p) => p.id === over.id);
        if (oldIdx === -1 || newIdx === -1) return;
        reorderPinned(arrayMove(auxPinned, oldIdx, newIdx));
        return;
      }

      // 3) 트리 노드 → 다른 트리 노드 (정렬 또는 부모 병합)
      if (activeData?.type === 'tree-node' && overData?.type === 'tree-node') {
        if (active.id === over.id) return;
        if (activeData.docType !== overData.docType) return; // cross-tree drop 차단
        if (!activeData.docType) return;
        const docType = activeData.docType;
        // sortable id는 prefix될 수 있음 — placement는 raw docId 사용
        const activeId = activeData.docId as string;
        const overDocId = overData.docId as string;
        if (activeId === overDocId) return; // 같은 노드 (사이드바/통합 뷰 동시 등록 시도)
        const overDepth = overData.depth ?? 0;
        const overParentId = (overData.parentId ?? null) as string | null;
        const overSortOrder = (overData as { sortOrder?: number }).sortOrder ?? 0;
        const workId = (activeData as { workId?: string }).workId;
        const activeCharId = (activeData as { characterId?: string }).characterId;
        const overCharId = (overData as { characterId?: string }).characterId;
        const rowSnapshot =
          (activeData as { rowSnapshot?: Record<string, unknown> }).rowSnapshot ?? {};

        // zone 결정 (drag 중 마지막 store 값)
        const z = zone ?? 'after';

        // character_note: cross-character 차단
        if (docType === 'character_note' && activeCharId !== overCharId) return;

        // merge 시 깊이 가드 (plot — 회차 위 병합 차단)
        if (z === 'merge' && docType === 'plot' && overDepth >= 1) return;

        // cycle 방지 (world_note merge — active의 descendant 위 drop 차단)
        if (z === 'merge' && docType === 'world_note') {
          let cursor: string | null = overDocId;
          while (cursor) {
            if (cursor === activeId) return;
            const r = await db.execute(
              'SELECT parent_id FROM world_note WHERE id = ?',
              [cursor],
            );
            cursor =
              (r.rows?._array as { parent_id: string | null }[] | undefined)?.[0]
                ?.parent_id ?? null;
          }
        }

        // ── 낙관적 업데이트: store에 즉시 추가 → UI 반영, DB는 백그라운드 ──
        // newSortOrder (floating point — UI ordering만)
        const newSortOrder =
          z === 'merge'
            ? Date.now()
            : z === 'before'
              ? overSortOrder - 0.5
              : overSortOrder + 0.5;
        // newParentId — world_note/plot만 의미. 평탄 리스트는 undefined
        const hasParentField = docType === 'world_note' || docType === 'plot';
        const newParentId = hasParentField
          ? z === 'merge'
            ? overDocId
            : overParentId
          : undefined;
        addOptimisticMove({
          docId: activeId,
          docType,
          newSortOrder,
          newParentId,
          rowSnapshot,
        });

        // placement 호출 — 정확한 sort_order 보장 (영향받는 형제 reindex)
        const run = async () => {
          try {
            if (z === 'merge') {
              if (docType === 'world_note') {
                await placeWorldNote(activeId, overDocId, null, 'end');
              } else if (docType === 'plot') {
                await placePlot(activeId, overDocId, null, 'end');
              }
            } else {
              if (docType === 'world_note') {
                await placeWorldNote(activeId, overParentId, overDocId, z);
              } else if (docType === 'plot') {
                await placePlot(activeId, overParentId, overDocId, z);
              } else if (docType === 'plan_note' && workId) {
                await placePlanNote(activeId, workId, overDocId, z);
              } else if (docType === 'episode' && workId) {
                await placeEpisode(activeId, workId, overDocId, z);
              } else if (docType === 'foreshadow' && workId) {
                await placeForeshadow(activeId, workId, overDocId, z);
              } else if (docType === 'idea_archive' && workId) {
                await placeIdea(activeId, workId, overDocId, z);
              } else if (docType === 'work') {
                await placeWork(activeId, overDocId, z);
              } else if (docType === 'character' && workId) {
                await placeCharacter(activeId, workId, overDocId, z);
              } else if (docType === 'character_note' && activeCharId) {
                await placeCharacterNote(activeId, activeCharId, overDocId, z);
              }
            }
          } finally {
            clearOptimisticMove(activeId);
          }
        };
        void run();
      }
    },
    [
      db,
      auxPinned,
      addPinnedAndShow,
      reorderPinned,
      placeWorldNote,
      placePlot,
      placePlanNote,
      placeEpisode,
      placeForeshadow,
      placeIdea,
      placeWork,
      placeCharacter,
      placeCharacterNote,
      clearDragZone,
      addOptimisticMove,
      clearOptimisticMove,
    ],
  );

  const handleDndCancel = useCallback(() => {
    clearDragZone();
    setActiveDrag(null);
  }, [clearDragZone]);

  return (
    <DndContext
      sensors={dndSensors}
      collisionDetection={pointerWithin}
      autoScroll={{
        threshold: { x: 0, y: 0.15 },
        interval: 5,
      }}
      onDragStart={handleDndStart}
      onDragMove={handleDndMove}
      onDragEnd={handleDndEnd}
      onDragCancel={handleDndCancel}
    >
      <AppShell
        activityBar={
          <ActivityBar
            activity={activity}
            onActivityChange={handleActivityChange}
            workSelected={selectedWorkId !== null}
            settingsMode={settingsMode}
            onSettingsClick={handleSettingsClick}
          />
        }
        sidebar={
          sidebarCollapsed || activity === 'trash' ? null : (
            <SecondarySidebar
              activity={activity}
              selectedWorkId={selectedWorkId}
              mainDoc={mainDoc}
              onWorkSelect={handleWorkSelect}
              onItemActivate={handleSidebarClick}
              onNewWork={(title: string) => void handleNewWork(title)}
              onNewWorldNote={(parentId?: string | null) => void handleNewWorldNote(parentId)}
              onNewPlanNote={() => void handleNewPlanNote()}
              width={sidebarWidth}
              onWidthChange={resizeSidebar}
              onCollapse={() => setSidebarCollapsed(true)}
              settingsMode={settingsMode}
              selectedSettingsItem={selectedSettingsItem}
              onSettingsItemSelect={setSelectedSettingsItem}
            />
          )
        }
        rightPanelToggle={toggleRightPanel}
        rightPanelVisible={rightPanelVisible}
        rightPanels={
          rightPanelVisible || isDraggingDoc ? (
            <RightPanels
              width={rightPanelsWidth}
              onWidthChange={resizeRightPanels}
              panels={auxPinned}
              onAddPanel={addPinnedAndShow}
              onRemovePanel={removePinned}
              onReorderPanels={reorderPinned}
              onToggleCollapse={togglePinnedCollapse}
              onOpenInMain={handleOpenInMain}
              isDraggingDoc={isDraggingDoc}
              activeTab={rightPanelTab}
              onTabChange={setRightPanelTab}
              selectedWorkId={selectedWorkId}
              mainDoc={mainDoc}
            />
          ) : null
        }
      >
        {settingsMode && selectedSettingsItem ? (
          <SettingsScreen settingsItemId={selectedSettingsItem} />
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            <MainTabBar
              onActiveSectionChange={(section) => {
                if (section) setActivity(section);
              }}
            />
            <div className="flex min-h-0 flex-1 flex-col">
              {renderMain({
                activity,
                workId: selectedWorkId,
                mainDoc,
                onSelectWork: handleWorkSelect,
                onDeselectWork: handleNewWorkReset,
                onCreateWork: handleNewWork,
                onSectionSelect: handleSectionSelect,
                onItemActivate: handleSidebarClick,
                onWorkDeleted: handleWorkDeleted,
                onNavigateTo: handleNavigateTo,
                onClose: () => void handleCloseMain(),
                onSendToRight: () => void handleSendMainToRight(),
              })}
            </div>
          </div>
        )}
      </AppShell>

      {resolver.showDialog && (
        <SyncDecisionDialog
          guestRowCount={resolver.guestRowCount}
          busy={resolver.busy}
          onUseServer={() => void resolver.resolveUseServer()}
          onCancel={() => void resolver.cancel()}
        />
      )}

      <DragOverlay dropAnimation={null}>
        {activeDrag ? (
          <div
            className="pointer-events-none rounded-md border-2 px-3 py-1.5 text-sm font-medium text-foreground shadow-lg"
            style={{
              // 35% 불투명 — 뒤 트리 노드가 65% 비침
              backgroundColor:
                'color-mix(in oklch, var(--background) 75%, transparent)',
              // 강한 primary 테두리로 카드 윤곽만 명확
              borderColor:
                'color-mix(in oklch, var(--primary) 60%, transparent)',
            }}
          >
            {activeDrag.title || '(이름 없음)'}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

interface RenderMainArgs {
  activity: Activity;
  workId: string | null;
  mainDoc: MainDoc | null;
  onSelectWork: (id: string) => void;
  onDeselectWork: () => void;
  onCreateWork: (title: string) => Promise<void>;
  onSectionSelect: (section: WorkspaceSection) => void;
  onItemActivate: (section: WorkspaceSection, itemId: string, intent: ClickIntent) => void;
  onWorkDeleted: () => void;
  onNavigateTo: (section: WorkspaceSection, itemId: string | null) => void;
  onClose: () => void;
  onSendToRight: () => void;
}

function renderMain({
  activity,
  workId,
  mainDoc,
  onSelectWork,
  onDeselectWork,
  onCreateWork,
  onSectionSelect,
  onItemActivate,
  onWorkDeleted,
  onNavigateTo,
  onClose,
  onSendToRight,
}: RenderMainArgs) {
  if (activity === 'trash') {
    return <TrashScreen />;
  }
  if (!workId) {
    return <WorkspaceHomeOverview onSelectWork={onSelectWork} onCreateWork={onCreateWork} />;
  }

  // mainDoc 있으면 해당 문서 에디터
  if (mainDoc) {
    return renderEditor({
      mainDoc,
      workId,
      onClose,
      onSendToRight,
      onNavigateTo,
      onItemActivate,
    });
  }

  // mainDoc 비어있을 때 — activity 별 빈/특수 화면
  if (activity === 'home') {
    return (
      <WorkspaceHomeScreen
        workId={workId}
        onSectionSelect={onSectionSelect}
        onDeleted={onWorkDeleted}
        onBack={onDeselectWork}
      />
    );
  }
  // 플롯은 막/회차 시각화 가치 있어 PlotOverview 보존 (예외)
  if (activity === 'plot') {
    return (
      <PlotOverview
        workId={workId}
        selectedItemId={null}
        onNavigateTo={onNavigateTo}
      />
    );
  }
  return <EmptyMainState activity={activity} />;
}

interface RenderEditorArgs {
  mainDoc: MainDoc;
  workId: string;
  onClose: () => void;
  onSendToRight: () => void;
  onNavigateTo: (section: WorkspaceSection, itemId: string | null) => void;
  onItemActivate: (section: WorkspaceSection, itemId: string, intent: ClickIntent) => void;
}

function renderEditor({
  mainDoc,
  workId,
  onClose,
  onSendToRight,
  onNavigateTo,
  onItemActivate,
}: RenderEditorArgs) {
  const { section, itemId } = mainDoc;

  switch (section) {
    case 'plan':
      return (
        <PlanSectionShell
          workId={workId}
          selectedItemId={itemId}
          onItemBack={onClose}
          onSendToRight={onSendToRight}
        />
      );
    case 'world-note':
      // key 제거 — child 클릭 시 itemId 변경되어도 컴포넌트는 그대로 유지 (깜빡임 방지)
      // 내부에서 noteId prop 변경에 useQuery + derive로 자연 반응
      return (
        <WorldNoteHierarchyScreen
          noteId={itemId}
          onBack={onClose}
          onSendToRight={onSendToRight}
        />
      );
    case 'character': {
      if (itemId.startsWith('char:')) {
        const charId = itemId.slice(5);
        return (
          <CharacterOverview
            characterId={charId}
            onBack={onClose}
            onSendToRight={onSendToRight}
            onNoteSelect={(noteId: string) =>
              onItemActivate('character', 'cnote:' + noteId, 'default')
            }
          />
        );
      }
      if (itemId.startsWith('cnote:')) {
        const noteId = itemId.slice(6);
        return (
          <CharacterNoteEditor
            key={noteId}
            noteId={noteId}
            onBack={onClose}
            onSendToRight={onSendToRight}
            onBackToCharacter={(charId) =>
              onItemActivate('character', 'char:' + charId, 'default')
            }
          />
        );
      }
      return null;
    }
    case 'plot':
      return (
        <PlotOverview
          workId={workId}
          selectedItemId={itemId}
          onNavigateTo={onNavigateTo}
        />
      );
    case 'episode':
      return (
        <EpisodeEditScreen
          key={itemId}
          id={itemId}
          onBack={onClose}
          onSendToRight={onSendToRight}
          onNavigateTo={onNavigateTo}
        />
      );
    case 'foreshadow':
      return (
        <ForeshadowEditScreen
          key={itemId}
          id={itemId}
          onBack={onClose}
          onSendToRight={onSendToRight}
        />
      );
    case 'idea-archive':
      return (
        <IdeaArchiveEditScreen
          key={itemId}
          id={itemId}
          onBack={onClose}
          onSendToRight={onSendToRight}
        />
      );
  }
  return null;
}
