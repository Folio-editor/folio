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

import java.util.List;
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
        for (SyncUploadRequest entry : entries) {
            syncService.process(entry, writerId);
        }
        return ResponseEntity.ok().build();
    }
}
