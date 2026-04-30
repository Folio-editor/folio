package com.storyzip.sync.controller;

import com.storyzip.sync.dto.SyncUploadRequest;
import com.storyzip.sync.service.SyncService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
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
 * <p>한 번의 요청에 여러 CRUD 항목을 묶어서 받는다.
 * 클라이언트는 PowerSync {@code getNextCrudTransaction()}으로 얻은
 * 모든 entry를 한 번의 HTTP 호출로 전송하고, 2xx 응답을 받은 뒤에만
 * {@code transaction.complete()}를 호출해 큐에서 제거한다.
 *
 * <p>각 entry는 SyncService 내부에서 독립 트랜잭션(REQUIRES_NEW)으로 처리되며,
 * {@link DataIntegrityViolationException} 같은 결정론적 실패는 swallow하여
 * 무한 재시도 폭주를 방지한다. 클라이언트는 다음 download sync 사이클에
 * 서버 진실값으로 자동 정정된다 (server-authoritative 원칙).
 *
 * <p>요금제 용량 제한은 동기화 파이프라인에서 강제하지 않는다.
 * 오프라인 퍼스트 원칙에 따라 서버는 모든 CRUD를 수용하고,
 * 용량 초과 여부는 {@code GET /api/v1/account/me}를 통해 프론트에서 확인한다.
 */
@RestController
@RequestMapping("/api/v1/sync")
@RequiredArgsConstructor
@Validated
@Slf4j
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
            Map.entry("character_note", 2),
            Map.entry("character_custom_field", 2),
            Map.entry("character_tag", 2),
            Map.entry("plot_episode_link", 2),
            Map.entry("foreshadow_link", 2)
    );

    @PostMapping("/upload")
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
        // 각 entry는 SyncService 내부에서 REQUIRES_NEW 트랜잭션으로 격리된다.
        // 결정론적 제약 위반(UNIQUE/FK/NOT NULL)은 swallow — 재시도해도 결과 같음.
        // 일시적 오류(락/네트워크/OOM)는 throw하여 PowerSync가 재시도하도록 한다.
        for (SyncUploadRequest entry : ordered) {
            try {
                syncService.process(entry, writerId);
            } catch (DataIntegrityViolationException ex) {
                // Permanent error — 클라이언트는 다음 download sync에서 서버 진실값으로 정정됨.
                // payload 전체를 로그에 남겨 사후 분석/복구 가능하도록.
                log.warn("[SyncQuarantine] writerId={} table={} op={} id={} cause={} payload={}",
                        writerId,
                        entry.table(),
                        entry.op(),
                        entry.id(),
                        ex.getMostSpecificCause() != null ? ex.getMostSpecificCause().getMessage() : ex.getMessage(),
                        entry.data());
            }
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
