package com.storyzip.ai.client.dto;

import com.fasterxml.jackson.annotation.JsonAlias;

/** FastAPI 응답 `task_id`를 `taskId`로 매핑. Spring 측 직렬화는 camelCase 유지. */
public record PingEnqueuedResponse(@JsonAlias("task_id") String taskId) {}
