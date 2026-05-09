/**
 * Agent 채팅 상태 (Phase 4).
 *
 * - 작품(workId)별 토글 ON/OFF: agentModeByWork
 * - 작품별 활성 thread 선택: activeThreadByWork
 * - 작품별 섹션 (chat | inbox) — 헤더 segmented 토글이 사용
 * - 본 store 는 메시지 캐시만 짧게 보관 — 단일 진실 원천은 backend agent_session.messages
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { AgentScenario, AgentThreadSummary } from '../api/agent';

interface ChatPartial {
  pendingMessage: string;        // 입력창 임시 보존
  lastSendAt: number;
}

export type AgentSection = 'chat' | 'inbox';

interface AgentChatStore {
  agentModeByWork: Record<string, boolean>;
  agentSectionByWork: Record<string, AgentSection>;
  activeThreadByWork: Record<string, string | null>;
  threadsByWork: Record<string, AgentThreadSummary[]>;
  scenarioByWork: Record<string, AgentScenario>;
  draftByThread: Record<string, ChatPartial>;
  busyThreads: Record<string, boolean>;     // SSE 또는 sync 호출 중

  setAgentMode: (workId: string, on: boolean) => void;
  setAgentSection: (workId: string, section: AgentSection) => void;
  setActiveThread: (workId: string, threadId: string | null) => void;
  setThreads: (workId: string, threads: AgentThreadSummary[]) => void;
  setScenario: (workId: string, scenario: AgentScenario) => void;
  setDraft: (threadId: string, text: string) => void;
  setBusy: (threadId: string, busy: boolean) => void;
}

export const useAgentChatStore = create<AgentChatStore>()(
  persist(
    (set) => ({
      agentModeByWork: {},
      agentSectionByWork: {},
      activeThreadByWork: {},
      threadsByWork: {},
      scenarioByWork: {},
      draftByThread: {},
      busyThreads: {},

      setAgentMode: (workId, on) =>
        set((s) => ({ agentModeByWork: { ...s.agentModeByWork, [workId]: on } })),
      setAgentSection: (workId, section) =>
        set((s) => ({ agentSectionByWork: { ...s.agentSectionByWork, [workId]: section } })),
      setActiveThread: (workId, threadId) =>
        set((s) => ({ activeThreadByWork: { ...s.activeThreadByWork, [workId]: threadId } })),
      setThreads: (workId, threads) =>
        set((s) => ({ threadsByWork: { ...s.threadsByWork, [workId]: threads } })),
      setScenario: (workId, scenario) =>
        set((s) => ({ scenarioByWork: { ...s.scenarioByWork, [workId]: scenario } })),
      setDraft: (threadId, text) =>
        set((s) => ({
          draftByThread: {
            ...s.draftByThread,
            [threadId]: { pendingMessage: text, lastSendAt: Date.now() },
          },
        })),
      setBusy: (threadId, busy) =>
        set((s) => ({ busyThreads: { ...s.busyThreads, [threadId]: busy } })),
    }),
    {
      name: 'agent-chat-store',
      partialize: (s) => ({
        agentModeByWork: s.agentModeByWork,
        agentSectionByWork: s.agentSectionByWork,
        activeThreadByWork: s.activeThreadByWork,
        scenarioByWork: s.scenarioByWork,
      }),
    },
  ),
);
