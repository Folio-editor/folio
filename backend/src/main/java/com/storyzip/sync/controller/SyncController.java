package com.storyzip.sync.controller;

import com.storyzip.sync.dto.SyncUploadRequest;
import com.storyzip.sync.service.SyncService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * PowerSync uploadData() 진입점.
 *
 * <p>한 번의 요청에 여러 CRUD 항목(트랜잭션 단위)을 묶어서 받는다.
 * 클라이언트는 PowerSync {@code getNextCrudTransaction()}으로 얻은
 * 모든 entry를 한 번의 HTTP 호출로 전송하고, 200 OK를 받은 뒤에만
 * {@code transaction.complete()}를 호출해 큐에서 제거한다.
 *
 * <p>도중 1건이라도 실패하면 {@link Transactional} 롤백 — 부분 저장 방지.
 */
@RestController
@RequestMapping("/api/v1/sync")
@RequiredArgsConstructor
@Validated
@Tag(name = "Sync", description = "PowerSync CRUD 업로드 API")
@SecurityRequirement(name = "bearerAuth")
public class SyncController {

    private final SyncService syncService;

    /**
     * FK depth — 부모 테이블일수록 낮은 숫자.
     * PUT은 얕은 순서(work 먼저)로, DELETE는 깊은 순서(link 먼저)로 처리해야
     * 외래키 제약 위반을 피할 수 있다.
     */
    private static final Map<String, Integer> TABLE_DEPTH = Map.ofEntries(
            Map.entry("work", 0),
            Map.entry("plan", 1),
            Map.entry("plan_note", 1),
            Map.entry("world_note", 1),
            Map.entry("character", 1),
            Map.entry("plot", 1),
            Map.entry("episode", 1),
            Map.entry("foreshadow", 1),
            Map.entry("idea_archive", 1),
            Map.entry("character_custom_field", 2),
            Map.entry("character_tag", 2),
            Map.entry("plot_episode_link", 2),
            Map.entry("foreshadow_link", 2)
    );

    @PostMapping("/upload")
    @Transactional
    @Operation(
            summary = "CRUD 일괄 업로드",
            description = "PowerSync 클라이언트가 로컬 변경사항(여러 행)을 한 번에 업로드한다"
    )
    public ResponseEntity<Void> upload(
            @RequestBody @NotEmpty List<@Valid SyncUploadRequest> entries,
            Authentication authentication
    ) {
        UUID writerId = UUID.fromString(authentication.getName());
        // PowerSync 클라이언트가 보낸 entry는 사용자 작업 순서대로 들어있지만
        // 부모-자식 테이블 순서가 섞이면 FK 제약에 걸릴 수 있다.
        // PUT은 얕은→깊은, DELETE는 깊은→얕은 순으로 재정렬.
        List<SyncUploadRequest> ordered = new ArrayList<>(entries);
        ordered.sort(Comparator
                .comparingInt(SyncController::opPriority)      // PUT/PATCH 먼저, DELETE 나중
                .thenComparingInt(SyncController::entryDepth)  // PUT: 얕은 테이블부터
        );
        for (SyncUploadRequest entry : ordered) {
            syncService.process(entry, writerId);
        }
        return ResponseEntity.noContent().build();
    }

    /** DELETE는 뒤로 몰기 위해 높은 값 */
    private static int opPriority(SyncUploadRequest e) {
        return "DELETE".equals(e.op()) ? 1 : 0;
    }

    /**
     * PUT/PATCH인 경우 얕은 depth가 먼저(오름차순).
     * DELETE는 깊은 depth가 먼저 처리되어야 하므로 음수로 뒤집는다.
     */
    private static int entryDepth(SyncUploadRequest e) {
        int d = TABLE_DEPTH.getOrDefault(e.table(), 99);
        return "DELETE".equals(e.op()) ? -d : d;
    }
}
