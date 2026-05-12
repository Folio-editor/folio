/**
 * Review/Spelling 하이라이트 자동 해제 hook.
 *
 * 클릭 jump 로 생긴 본문 하이라이트(`useReviewHighlightStore`)는 명시적 해제가 어렵다.
 * 이 hook 은 다음 시점에 자동으로 `clearIssues()` 를 호출해 잔여 표시를 제거한다:
 *   1) 우측 패널이 AI 외 탭으로 변경 (사용자가 검수 컨텍스트를 떠남)
 *   2) AI 탭이지만 결과 화면이 아닐 때 (검수/맞춤법 결과/이력 화면이 아니면 의미 없음)
 *   3) 메인 탭에서 다른 회차로 전환 (다른 회차 본다는 건 현재 하이라이트와 무관)
 *
 * AppShell 또는 RightPanelHeader 처럼 라이프사이클 동안 1회만 마운트되는 위치에서 호출.
 */
import { useEffect } from 'react';

import { useAiSessionStore } from '../stores/aiSessionStore';
import { useMainTabsStore } from '../stores/mainTabsStore';
import { useReviewHighlightStore } from '../stores/reviewHighlightStore';
import type { RightPanelTab } from '../types/workspace';

const RESULT_SCREENS = new Set([
  'review-result',
  'review-history-view',
  'spellcheck-result',
  'spellcheck-history-view',
]);

export function useReviewHighlightAutoCleanup(activeTab: RightPanelTab): void {
  const aiScreen = useAiSessionStore((s) => s.screen);
  // 메인 탭의 현재 active item — 작품 컨텍스트 변경/회차 전환을 감지.
  const activeItemId = useMainTabsStore((s) => {
    if (!s.currentWorkId) return null;
    const tabId = s.activeTabIdByWork[s.currentWorkId] ?? null;
    if (!tabId) return null;
    return s.tabs.find((t) => t.id === tabId)?.doc?.itemId ?? null;
  });

  // 1) AI 외 탭으로 이동 — 검수 컨텍스트 자체를 떠남.
  useEffect(() => {
    if (activeTab !== 'ai') {
      const s = useReviewHighlightStore.getState();
      if (s.issues.length > 0) s.clearIssues();
    }
  }, [activeTab]);

  // 2) AI 탭이지만 결과 화면이 아닐 때 — 메뉴/입력 화면에선 하이라이트가 컨텍스트를 잃음.
  useEffect(() => {
    if (activeTab !== 'ai') return;     // 1) 에서 이미 처리
    if (!RESULT_SCREENS.has(aiScreen)) {
      const s = useReviewHighlightStore.getState();
      if (s.issues.length > 0) s.clearIssues();
    }
  }, [activeTab, aiScreen]);

  // 3) 메인 탭에서 다른 회차로 전환 — store.episodeId 격리로 데코는 안 그려지지만
  //    store 상태가 stale 하게 남아 다시 같은 회차로 돌아오면 unexpected 하이라이트 부활.
  useEffect(() => {
    const s = useReviewHighlightStore.getState();
    if (!s.episodeId) return;
    if (activeItemId && s.episodeId !== activeItemId) {
      s.clearIssues();
    }
  }, [activeItemId]);
}
