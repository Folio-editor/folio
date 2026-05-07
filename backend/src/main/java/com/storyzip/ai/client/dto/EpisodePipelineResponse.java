package com.storyzip.ai.client.dto;

import com.fasterxml.jackson.annotation.JsonAlias;

/**
 * AI 파이프라인(인덱싱·요약) 공용 응답 DTO.
 *
 * <p>Phase 2 재설계 (curious-wiggling-thacker R-B/R-C):
 *  - {@code status="accepted"} — task 가 큐에 적재됨, {@link #taskId()} 존재
 *  - {@code status="skipped"} — 폭주 가드 / 평문 미발급 등으로 skip, {@link #taskId()} null,
 *    {@link #reason()} 에 사유 코드 (e.g. {@code content_unchanged}, {@code cooldown},
 *    {@code daily_limit}, {@code no_plaintext}). skip 은 정상 케이스이므로 클라이언트는
 *    예외 처리 안 함.
 *  - {@link #idempotencyKey()} — {@code "<pipeline>:<episode_id>:<content_hash 16>"} 포맷.
 *    backend 가 그대로 로그 + ai_job 테이블 추적 키로 사용.
 */
public record EpisodePipelineResponse(
        @JsonAlias("task_id") String taskId,
        String status,
        String reason,
        @JsonAlias("idempotency_key") String idempotencyKey) {}
