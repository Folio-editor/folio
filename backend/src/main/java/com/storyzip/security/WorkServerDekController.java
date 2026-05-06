package com.storyzip.security;

import com.storyzip.sync.domain.Work;
import com.storyzip.sync.repository.WorkRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Arrays;
import java.util.Base64;
import java.util.UUID;

/**
 * 작품 생성 시 클라이언트가 raw work_key 를 한 번 TLS 로 전송 →
 * VaultKmsService.encrypt() 로 wrap → work.server_encrypted_dek 에 저장.
 *
 * <p>오프라인에서 생성된 작품도 온라인 복귀 시 이 엔드포인트로 보강.
 *
 * <p>호출 시점:
 * <ul>
 *   <li>온라인 신규 작품: 클라이언트가 work 생성 직후 (PowerSync upload 와 별개)</li>
 *   <li>오프라인 신규 작품: 온라인 복귀 시 server_encrypted_dek=NULL 인 work 발견하면 호출</li>
 * </ul>
 *
 * <p>보안 약속: raw work_key 는 응답 후 메모리에서 즉시 폐기. 로그 0, DB 0 (wrap 결과만 저장).
 *
 * <p>curious-wiggling-thacker plan V-5.
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/works")
@RequiredArgsConstructor
@Tag(name = "Work Server DEK", description = "Vault Transit envelope encryption")
@SecurityRequirement(name = "bearerAuth")
@ConditionalOnBean(KmsService.class)
public class WorkServerDekController {

    private final WorkRepository workRepo;
    private final KmsService kms;

    public record ServerDekRequest(
            @NotNull UUID workId,
            @NotBlank String rawWorkKey  // base64-encoded 32B
    ) {}

    public record ServerDekResponse(boolean ok) {}

    @Operation(summary = "raw work_key 를 Vault 로 wrap 하여 server_encrypted_dek 발급")
    @PostMapping("/server-dek")
    @Transactional
    public ResponseEntity<ServerDekResponse> issue(
            @RequestBody ServerDekRequest req,
            Authentication auth
    ) {
        UUID writerId;
        try {
            writerId = UUID.fromString(auth.getName());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "invalid auth principal");
        }

        // PowerSync 가 아직 work 행을 서버에 sync 하지 않은 시점에 클라가 호출할 수 있다.
        // 이 경우 NOT_FOUND 가 아니라 CONFLICT 로 응답 → 클라가 pending queue 에 적재 후
        // 다음 retryPendingServerDeks() 호출 (온라인 복귀·부팅) 에서 재시도.
        Work work = workRepo.findById(req.workId()).orElse(null);
        if (work == null) {
            log.info("server-dek 발급 보류 — work {} 미동기화 (PowerSync 대기)", req.workId());
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "work not yet synced (retry after powersync upload)");
        }
        if (!work.getWriterId().equals(writerId)) {
            throw new AccessDeniedException("not your work");
        }

        byte[] raw = null;
        try {
            raw = Base64.getDecoder().decode(req.rawWorkKey());
            if (raw.length != 32) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "rawWorkKey must be 32 bytes");
            }
            byte[] wrapped = kms.encrypt(raw);
            work.setServerEncryptedDek(wrapped);
            workRepo.save(work);
            log.info("server_encrypted_dek 발급 완료 workId={}", req.workId());
            return ResponseEntity.ok(new ServerDekResponse(true));
        } catch (ResponseStatusException | AccessDeniedException e) {
            throw e;
        } catch (Exception e) {
            // 디버깅: 정확한 원인을 응답 body 에 포함 (dev 전용 정보 노출이지만 fix 후 제거)
            String detail = e.getClass().getSimpleName() + ": " + e.getMessage();
            Throwable cause = e.getCause();
            while (cause != null) {
                detail += " | caused by " + cause.getClass().getSimpleName() + ": " + cause.getMessage();
                cause = cause.getCause();
            }
            log.error("server-dek 발급 실패 workId={} detail={}", req.workId(), detail, e);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, detail);
        } finally {
            if (raw != null) Arrays.fill(raw, (byte) 0);
        }
    }
}
