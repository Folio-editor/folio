/**
 * Agent REST API 클라이언트 (Phase 4).
 *
 * 백엔드 /api/v1/agent/...
 * - threads (POST/GET)
 * - threads/{id}/messages (sync POST)
 * - threads/{id}/messages/async (async POST → task_id)
 * - suggestions (GET/PATCH)
 */

import { apiClient } from '../lib/apiClient';

export type AgentScenario =
  | 'auto'
  | 'draft_next'
  | 'consistency_check'
  | 'revision'
  | 'extraction'
  | 'qa'
  | 'ideation';

// Phase 4 — 사용자는 시나리오를 선택하지 않는다. 모든 채팅은 'auto' 로 시작,
// Sonnet planner 가 메시지 의도를 직접 분류해 적절한 도구 호출을 한다.
// 비동기는 'auto' 1종에 통합 (모든 호출 Celery 경유 → 진행률 폴링).
export const ASYNC_SCENARIOS = new Set<AgentScenario>([
  'auto',
  'draft_next',
  'revision',
  'consistency_check',
  'extraction',
]);

export interface AgentThreadSummary {
  thread_id: string;
  scenario: AgentScenario;
  title: string | null;
  status: 'active' | 'closed';
  last_activity_at: string | null;
  created_at: string | null;
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system';
  content: unknown;
}

export interface AgentThreadDetail {
  thread_id: string;
  work_id: string;
  writer_id: string;
  scenario: AgentScenario;
  title: string | null;
  status: 'active' | 'closed';
  messages: AgentMessage[];
  summary_so_far: string | null;
}

export interface AgentRunResponse {
  thread_id: string;
  scenario: AgentScenario;
  status: 'success' | 'partial' | 'failed';
  answer: string;
  suggestion_ids: string[];
  receipt: {
    receipt_id?: string;
    charged?: number;
    balance?: number;
    partial?: boolean;
    error?: string;
  } | null;
  duration_ms?: number;
  budget?: {
    iterations?: number;
    user_tokens?: number;
    abort?: string | null;
  };
}

export interface AgentTaskResponse {
  task_id: string;
  thread_id: string;
  scenario: AgentScenario;
}

export interface AgentSuggestion {
  id: string;
  work_id: string;
  episode_id: string | null;
  entity_type: string;
  suggested_name: string;
  payload: Record<string, unknown>;
  source_agent: string | null;
  source_thread_id: string | null;
  status: 'pending' | 'confirmed' | 'rejected';
  reviewer_note: string | null;
  created_at: string;
  updated_at: string;
}

// ─────── Threads ───────

export function createAgentThread(workId: string, scenario: AgentScenario, title?: string) {
  return apiClient.post<{ threadId: string; scenario: AgentScenario; title: string | null }>(
    '/agent/threads',
    { workId, scenario, title },
  );
}

export function listAgentThreads(workId: string) {
  return apiClient.get<AgentThreadSummary[]>(
    `/agent/threads?workId=${encodeURIComponent(workId)}`,
  );
}

export function getAgentThread(threadId: string) {
  return apiClient.get<AgentThreadDetail>(`/agent/threads/${threadId}`);
}

export function sendAgentMessage(threadId: string, message: string) {
  return apiClient.post<AgentRunResponse>(`/agent/threads/${threadId}/messages`, { message });
}

export function sendAgentMessageAsync(threadId: string, message: string) {
  return apiClient.post<AgentTaskResponse>(`/agent/threads/${threadId}/messages/async`, {
    message,
  });
}

export interface AgentTaskStatus {
  task_id: string;
  state: 'PENDING' | 'STARTED' | 'PROGRESS' | 'SUCCESS' | 'FAILURE' | 'REVOKED' | string;
  ready: boolean;
  successful: boolean | null;
  info: {
    iterations?: number;
    input_raw?: number;
    output_raw?: number;
    user_tokens?: number;
    tool_calls?: Record<string, number>;
    recent_lines?: Array<{
      seq: number;
      step_type: string;
      actor: string;
      tool_name: string | null;
      input_tokens: number;
      output_tokens: number;
      user_tokens: number;
      detail: Record<string, unknown>;
    }>;
    // FAILURE 시
    error_type?: string;
    error_message?: string;
    traceback?: string;
  } | null;
  result: AgentRunResponse | null;
}

export function getAgentTaskStatus(taskId: string) {
  return apiClient.get<AgentTaskStatus>(`/agent/tasks/${taskId}/status`);
}

// ── SSE 스트리밍 ──

export interface AgentStreamStepEvent {
  type: 'step';
  seq: number;
  step_type: 'planner_call' | 'tool_call' | 'worker_call' | 'compression';
  actor: string;
  tool_name: string | null;
  input_tokens: number;
  output_tokens: number;
  user_tokens: number;
  iterations?: number;
  cum_user_tokens?: number;
}

export interface AgentStreamDoneEvent {
  type: 'done';
  thread_id: string;
  scenario: string;
  status: 'success' | 'partial' | 'failed';
  answer: string;
  suggestion_ids: string[];
  receipt: AgentRunResponse['receipt'];
  budget?: AgentRunResponse['budget'];
  duration_ms?: number;
}

export interface AgentStreamErrorEvent {
  type: 'error';
  error_type: string;
  error_message: string;
}

export interface AgentStreamTextDeltaEvent {
  type: 'text_delta';
  text: string;
}

export interface AgentStreamAssistantStartEvent {
  type: 'assistant_start';
}

export interface AgentStreamAssistantEndEvent {
  type: 'assistant_end';
}

export type AgentStreamEvent =
  | AgentStreamStepEvent
  | AgentStreamTextDeltaEvent
  | AgentStreamAssistantStartEvent
  | AgentStreamAssistantEndEvent
  | AgentStreamDoneEvent
  | AgentStreamErrorEvent;

// ─────── Suggestions ───────

export function listSuggestions(status?: string, entityType?: string) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (entityType) params.set('entityType', entityType);
  const qs = params.toString();
  return apiClient.get<AgentSuggestion[]>(`/agent/suggestions${qs ? '?' + qs : ''}`);
}

export function patchSuggestion(id: string, status: 'confirmed' | 'rejected', reviewerNote?: string) {
  return apiClient.patch<{ id: string; status: string }>(`/agent/suggestions/${id}`, {
    status,
    reviewerNote,
  });
}
