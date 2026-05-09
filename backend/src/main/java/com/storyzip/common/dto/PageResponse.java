package com.storyzip.common.dto;

import org.springframework.data.domain.Page;

import java.util.List;

/**
 * 페이지네이션 응답 공통 포맷.
 *
 * <p>Spring Data {@link Page} 의 직렬화 결과는 비안정적(스펙 보장 X)이라 직접 매핑한 DTO 로 응답한다.
 * 프론트가 의존하는 필드만 노출 — content / page / size / totalElements / totalPages / hasNext.
 */
public record PageResponse<T>(
        List<T> content,
        int page,
        int size,
        long totalElements,
        int totalPages,
        boolean hasNext
) {
    public static <T> PageResponse<T> from(Page<T> page) {
        return new PageResponse<>(
                page.getContent(),
                page.getNumber(),
                page.getSize(),
                page.getTotalElements(),
                page.getTotalPages(),
                page.hasNext()
        );
    }
}
