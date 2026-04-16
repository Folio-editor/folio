package com.storyzip.sync.dto;

import jakarta.validation.constraints.NotBlank;
import java.util.Map;

public record SyncUploadRequest(
    @NotBlank String table,
    @NotBlank String op,
    @NotBlank String id,
    Map<String, Object> data
) {}
