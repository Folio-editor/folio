package com.storyzip.analytics.service;

import java.util.Map;
import java.util.Set;

final class AnalyticsEventSpec {

    private static final Set<String> COMMON_PARAMS = Set.of(
            "offline_queued",
            "session_id",
            "engagement_time_msec",
            "page_title",
            "page_location",
            "screen_name"
    );

    private static final Map<String, Set<String>> EVENT_PARAMS = Map.ofEntries(
            Map.entry("landing_viewed", Set.of("platform", "utm_source", "utm_campaign")),
            Map.entry("web_enter_clicked", Set.of("surface", "platform")),
            Map.entry("editor_entered", Set.of("platform", "entry_source")),
            Map.entry("writing_started", Set.of("platform", "doc_type", "entry_source")),
            Map.entry("app_opened", Set.of("app_version", "online")),
            Map.entry("login_started", Set.of("provider")),
            Map.entry("login_succeeded", Set.of("provider", "is_new_user")),
            Map.entry("login_failed", Set.of("reason_code")),
            Map.entry("desktop_download_clicked", Set.of("surface", "os", "download_channel")),
            Map.entry("desktop_download_started", Set.of("os", "download_channel")),
            Map.entry("desktop_download_failed", Set.of("os", "download_channel", "reason_code")),
            Map.entry("workspace_opened", Set.of("work_count_bucket")),
            Map.entry("document_created", Set.of("doc_type", "source", "template_type")),
            Map.entry("document_edit_started", Set.of("doc_type", "char_count_bucket")),
            Map.entry("document_edit_session_ended", Set.of("doc_type", "edit_duration_bucket", "delta_char_count_bucket")),
            Map.entry("document_deleted", Set.of("doc_type")),
            Map.entry("document_saved", Set.of("doc_type", "char_count_bucket")),
            Map.entry("document_save_failed", Set.of("doc_type", "reason_code")),
            Map.entry("sync_started", Set.of("queue_count_bucket")),
            Map.entry("sync_succeeded", Set.of("event_count_bucket")),
            Map.entry("sync_failed", Set.of("reason_code", "retry_count_bucket")),
            Map.entry("offline_entered", Set.of("queued_event_count_bucket")),
            Map.entry("online_restored", Set.of("queued_event_count_bucket")),
            Map.entry("theme_changed", Set.of("theme_id", "mode")),
            Map.entry("checkout_initiated", Set.of("product_type", "amount_bucket")),
            Map.entry("payment_succeeded", Set.of("product_type", "amount_bucket")),
            Map.entry("payment_failed", Set.of("product_type", "reason_code")),
            Map.entry("decryption_failure", Set.of("field_type", "reason_code")),
            Map.entry("kek_derivation_failed", Set.of("reason_code")),
            Map.entry("sync_decision_made", Set.of("decision", "is_new_user")),
            Map.entry("document_edit_failed", Set.of("doc_type", "reason_code")),
            Map.entry("ai_review_requested", Set.of("doc_type", "char_count_bucket")),
            Map.entry("ai_review_succeeded", Set.of("doc_type", "duration_bucket")),
            Map.entry("ai_review_failed", Set.of("doc_type", "reason_code")),
            Map.entry("ai_feature_opened", Set.of("feature")),
            Map.entry("ai_create_requested", Set.of("prompt_char_count_bucket", "reference_char_count_bucket")),
            Map.entry("ai_create_succeeded", Set.of("duration_bucket", "suggestion_count_bucket")),
            Map.entry("ai_create_failed", Set.of("reason_code")),
            Map.entry("ai_chat_opened", Set.of("entry_source")),
            Map.entry("ai_chat_thread_created", Set.of("scenario")),
            Map.entry("ai_chat_thread_create_failed", Set.of("reason_code")),
            Map.entry("ai_chat_message_sent", Set.of("message_char_count_bucket")),
            Map.entry("ai_chat_message_succeeded", Set.of("duration_bucket", "suggestion_count_bucket", "status")),
            Map.entry("ai_chat_message_failed", Set.of("reason_code")),
            Map.entry("ai_chat_message_aborted", Set.of("duration_bucket")),
            Map.entry("ai_spellcheck_requested", Set.of("doc_type", "char_count_bucket", "mode")),
            Map.entry("ai_spellcheck_succeeded", Set.of("doc_type", "issue_count_bucket", "duration_bucket")),
            Map.entry("ai_spellcheck_failed", Set.of("doc_type", "reason_code", "mode")),
            Map.entry("ai_summarize_requested", Set.of("doc_type")),
            Map.entry("ai_summarize_succeeded", Set.of("doc_type", "duration_bucket", "cached")),
            Map.entry("ai_summarize_failed", Set.of("doc_type", "reason_code")),
            Map.entry("ai_feature_insufficient_credits", Set.of("feature_type"))
    );

    private AnalyticsEventSpec() {
    }

    static boolean isAllowedEvent(String eventName) {
        return EVENT_PARAMS.containsKey(eventName);
    }

    static boolean isAllowedParam(String eventName, String paramName) {
        return COMMON_PARAMS.contains(paramName)
                || EVENT_PARAMS.getOrDefault(eventName, Set.of()).contains(paramName);
    }
}
