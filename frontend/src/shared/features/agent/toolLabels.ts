/**
 * Agent SSE step 의 도구 ID → 작가용 한글 라벨 매핑.
 *
 * AgentChatPanel (채팅 모드) + CreateStreamingScreen (카드 모드) 양쪽이 공유한다.
 * 매핑 미존재 시 fallback 은 함수명을 노출하지 않고 일반 라벨 ('도구 실행 중') 로 마스킹 —
 * 사용자에게 raw 함수명/시스템 명칭 노출 금지 정책.
 */

export const TOOL_LABELS: Record<string, string> = {
  // 조회 (read-only)
  list_plots: '플롯 목록 조회 중',
  get_plot: '플롯 상세 조회 중',
  list_characters: '인물 목록 조회 중',
  get_character: '인물 상세 조회 중',
  list_world_notes: '세계관 목록 조회 중',
  get_world_note: '세계관 상세 조회 중',
  list_episodes: '회차 목록 조회 중',
  list_all_oneline_summaries: '회차 한 줄 요약 모음 조회 중',
  list_episode_summaries: '회차 요약 목록 조회 중',
  get_episode_summary: '회차 요약 조회 중',
  fetch_episode_plaintext: '회차 본문 가져오는 중',
  // 검색 / 분석
  check_spelling: '맞춤법 검사 중',
  search_episode_summaries: '회차 요약 검색 중',
  search_episode_chunks: '본문 청크 검색 중',
  query_episodes_by_chunks: '본문 자유 검색 중',
  find_relevant_episodes: '관련 회차 탐색 중',
  track_foreshadow: '복선 추적 분석 중',
  character_arc: '인물 행적 분석 중',
  timeline_scan: '시간선 점검 중',
  summarize_episode: '회차 요약 생성 중',
  analyze_episode: '회차 심층 분석 중',
  request_episode_summary_backfill: '전체 요약 백필 요청 중',
  // 보조 에이전트
  invoke_haiku_worker: '보조 에이전트 작업 중',
  // 쓰기 제안 (작가 승인 큐)
  propose_character: '인물 등록 제안 작성 중',
  propose_character_update: '인물 수정 제안 작성 중',
  propose_character_delete: '인물 삭제 제안 작성 중',
  propose_world_note: '세계관 등록 제안 작성 중',
  propose_world_note_update: '세계관 수정 제안 작성 중',
  propose_world_note_delete: '세계관 삭제 제안 작성 중',
  propose_plot_create: '플롯 추가 제안 작성 중',
  propose_plot_tree: '챕터 트리 추가 제안 작성 중',
  propose_plot_revision: '플롯 재작성 제안 작성 중',
  propose_plot_delete: '플롯 삭제 제안 작성 중',
  propose_episode_draft: '회차 초안 작성 중',
  propose_episode_update: '회차 수정 제안 작성 중',
  propose_episode_delete: '회차 삭제 제안 작성 중',
  propose_review_issue: '검수 이슈 작성 중',
  propose_spelling_fix: '맞춤법 수정 제안 작성 중',
  propose_spelling_fix_batch: '맞춤법 일괄 수정 제안 작성 중',
};

/** 도구 ID → 한글 라벨. 매핑 없으면 raw 함수명 대신 일반 라벨로 마스킹. */
export function toolLabel(toolName: string | null | undefined): string {
  if (!toolName) return '도구 실행 중';
  return TOOL_LABELS[toolName] ?? '도구 실행 중';
}
