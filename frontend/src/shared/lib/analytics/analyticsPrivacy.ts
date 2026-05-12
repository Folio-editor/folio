import type { AnalyticsEventName } from './analyticsEvents';

const COMMON_PARAMS = new Set([
  'offline_queued',
  'session_id',
  'engagement_time_msec',
  'page_title',
  'page_location',
  'screen_name',
]);

const EVENT_PARAMS: Record<AnalyticsEventName, Set<string>> = {
  landing_viewed: new Set(['platform', 'utm_source', 'utm_campaign']),
  web_enter_clicked: new Set(['surface', 'platform']),
  editor_entered: new Set(['platform', 'entry_source']),
  writing_started: new Set(['platform', 'doc_type', 'entry_source']),
  app_opened: new Set(['app_version', 'online']),
  login_started: new Set(['provider']),
  login_succeeded: new Set(['provider', 'is_new_user']),
  login_failed: new Set(['reason_code']),
  desktop_download_clicked: new Set(['surface', 'os', 'download_channel']),
  desktop_download_started: new Set(['os', 'download_channel']),
  desktop_download_failed: new Set(['os', 'download_channel', 'reason_code']),
  workspace_opened: new Set(['work_count_bucket']),
  document_created: new Set(['doc_type', 'source', 'template_type']),
  document_edit_started: new Set(['doc_type', 'char_count_bucket']),
  document_edit_session_ended: new Set([
    'doc_type',
    'edit_duration_bucket',
    'delta_char_count_bucket',
  ]),
  document_deleted: new Set(['doc_type']),
  document_saved: new Set(['doc_type', 'char_count_bucket']),
  document_save_failed: new Set(['doc_type', 'reason_code']),
  sync_started: new Set(['queue_count_bucket']),
  sync_succeeded: new Set(['event_count_bucket']),
  sync_failed: new Set(['reason_code', 'retry_count_bucket']),
  offline_entered: new Set(['queued_event_count_bucket']),
  online_restored: new Set(['queued_event_count_bucket']),
  ai_review_requested: new Set(['doc_type', 'char_count_bucket']),
  ai_review_succeeded: new Set(['doc_type', 'duration_bucket']),
  ai_review_failed: new Set(['doc_type', 'reason_code']),
  theme_changed: new Set(['theme_id', 'mode']),
  // P0 (2026-05-12) — 결제·AI 결과·암호화 실패·로그인 보강
  checkout_initiated: new Set(['product_type', 'amount_bucket']),
  payment_succeeded: new Set(['product_type', 'amount_bucket']),
  payment_failed: new Set(['product_type', 'reason_code']),
  ai_spellcheck_requested: new Set(['doc_type', 'char_count_bucket', 'mode']),
  ai_spellcheck_succeeded: new Set(['doc_type', 'issue_count_bucket', 'duration_bucket']),
  ai_feature_insufficient_credits: new Set(['feature_type']),
  decryption_failure: new Set(['field_type', 'reason_code']),
  kek_derivation_failed: new Set(['reason_code']),
  sync_decision_made: new Set(['decision', 'is_new_user']),
  document_edit_failed: new Set(['doc_type', 'reason_code']),
};

export function sanitizeAnalyticsParams(
  eventName: AnalyticsEventName,
  params: Record<string, unknown>,
): Record<string, string | number | boolean> {
  // 미등록 이벤트가 와도 throw 하지 않도록 fallback — 이전 누락으로 결제 취소 시
  // TypeError 발생한 회귀 차단. 미등록이면 COMMON_PARAMS 만 통과.
  const allowed = EVENT_PARAMS[eventName] ?? new Set<string>();
  const sanitized: Record<string, string | number | boolean> = {};

  for (const [key, value] of Object.entries(params)) {
    if (!allowed.has(key) && !COMMON_PARAMS.has(key)) continue;
    if (value === undefined || value === null) continue;

    if (typeof value === 'string') {
      sanitized[key] = value.slice(0, 100);
      continue;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
