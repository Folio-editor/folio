export type AnalyticsPlatform = 'web' | 'electron';

export type AnalyticsEventMap = {
  landing_viewed: {
    platform: AnalyticsPlatform;
    utm_source?: string;
    utm_campaign?: string;
  };
  web_enter_clicked: {
    surface: string;
    platform: AnalyticsPlatform;
  };
  editor_entered: {
    platform: AnalyticsPlatform;
    entry_source: string;
  };
  writing_started: {
    platform: AnalyticsPlatform;
    doc_type: string;
    entry_source: string;
  };
  app_opened: {
    app_version?: string;
    online: boolean;
  };
  login_started: {
    provider: string;
  };
  login_succeeded: {
    provider: string;
    is_new_user: boolean;
  };
  login_failed: {
    reason_code: string;
  };
  desktop_download_clicked: {
    surface: string;
    os: string;
    download_channel: string;
  };
  desktop_download_started: {
    os: string;
    download_channel: string;
  };
  desktop_download_failed: {
    os: string;
    download_channel: string;
    reason_code: string;
  };
  workspace_opened: {
    work_count_bucket: string;
  };
  document_created: {
    doc_type: string;
    source: string;
    template_type?: string;
  };
  document_edit_started: {
    doc_type: string;
    char_count_bucket: string;
  };
  document_edit_session_ended: {
    doc_type: string;
    edit_duration_bucket: string;
    delta_char_count_bucket: string;
  };
  document_deleted: {
    doc_type: string;
  };
  document_saved: {
    doc_type: string;
    char_count_bucket: string;
  };
  document_save_failed: {
    doc_type: string;
    reason_code: string;
  };
  sync_started: {
    queue_count_bucket: string;
  };
  sync_succeeded: {
    event_count_bucket: string;
  };
  sync_failed: {
    reason_code: string;
    retry_count_bucket: string;
  };
  offline_entered: {
    queued_event_count_bucket: string;
  };
  online_restored: {
    queued_event_count_bucket: string;
  };
  ai_review_requested: {
    doc_type: string;
    char_count_bucket: string;
  };
  ai_review_succeeded: {
    doc_type: string;
    duration_bucket: string;
  };
  ai_review_failed: {
    doc_type: string;
    reason_code: string;
  };
  theme_changed: {
    theme_id: string;
    mode: string;
  };
  // ─── P0 (2026-05-12): 매출 / 안정성 가시화 ───
  checkout_initiated: {
    product_type: 'one_time' | 'subscription';
    amount_bucket: string;
  };
  payment_succeeded: {
    product_type: 'one_time' | 'subscription';
    amount_bucket: string;
  };
  payment_failed: {
    product_type: 'one_time' | 'subscription';
    reason_code: string;
  };
  ai_spellcheck_requested: {
    doc_type: string;
    char_count_bucket: string;
    mode: 'episode' | 'selection';
  };
  ai_spellcheck_succeeded: {
    doc_type: string;
    issue_count_bucket: string;
    duration_bucket: string;
  };
  ai_feature_insufficient_credits: {
    feature_type: 'review' | 'spellcheck' | 'draft' | 'agent';
  };
  decryption_failure: {
    field_type: string;
    reason_code: string;
  };
  kek_derivation_failed: {
    reason_code: string;
  };
  sync_decision_made: {
    decision: 'use-server' | 'use-local';
    is_new_user: boolean;
  };
  document_edit_failed: {
    doc_type: string;
    reason_code: string;
  };
};

export type AnalyticsEventName = keyof AnalyticsEventMap;
export type AnalyticsParams<TName extends AnalyticsEventName> = AnalyticsEventMap[TName] & {
  offline_queued?: boolean;
  session_id?: string;
  engagement_time_msec?: number;
  page_title?: string;
  page_location?: string;
  screen_name?: string;
};

export type QueuedAnalyticsEvent = {
  id: string;
  name: AnalyticsEventName;
  params: Record<string, string | number | boolean>;
  createdAt: string;
  retryCount: number;
};
