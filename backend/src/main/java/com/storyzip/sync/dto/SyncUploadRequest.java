package com.storyzip.sync.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import java.util.Map;

public record SyncUploadRequest(
    @NotBlank
    @Pattern(regexp = "work|plan|plan_note|world_note|character|character_custom_field|"
            + "character_tag|plot|episode|plot_episode_link|foreshadow|foreshadow_link|idea_archive",
            message = "허용되지 않은 테이블: ${validatedValue}")
    String table,

    @NotBlank
    @Pattern(regexp = "PUT|PATCH|DELETE", message = "허용되지 않은 op: ${validatedValue}")
    String op,

    @NotBlank String id,
    Map<String, Object> data
) {}
