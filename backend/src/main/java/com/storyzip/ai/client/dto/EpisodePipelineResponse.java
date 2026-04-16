package com.storyzip.ai.client.dto;

import com.fasterxml.jackson.annotation.JsonAlias;

public record EpisodePipelineResponse(@JsonAlias("task_id") String taskId, String status) {}
