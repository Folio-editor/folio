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
};

export function sanitizeAnalyticsParams(
  eventName: AnalyticsEventName,
  params: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const allowed = EVENT_PARAMS[eventName];
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
