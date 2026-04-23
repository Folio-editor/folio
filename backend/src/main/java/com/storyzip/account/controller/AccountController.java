package com.storyzip.account.controller;

import com.storyzip.account.dto.AccountInfoResponse;
import com.storyzip.account.service.AccountService;
import com.storyzip.common.exception.AuthException;
import com.storyzip.common.exception.ErrorCode;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/account")
@RequiredArgsConstructor
@Tag(name = "Account", description = "계정 정보 및 사용량 API")
@SecurityRequirement(name = "bearerAuth")
public class AccountController {

    private final AccountService accountService;

    @GetMapping("/me")
    @Operation(summary = "내 계정 정보 조회", description = "프로필, 요금제, 클라우드 사용량, 구독 정보를 반환합니다.")
    public ResponseEntity<AccountInfoResponse> getMyAccount(Authentication authentication) {
        UUID writerId = requireWriterId(authentication);
        return ResponseEntity.ok(accountService.getAccountInfo(writerId));
    }

    private UUID requireWriterId(Authentication authentication) {
        if (authentication == null || authentication.getPrincipal() == null) {
            throw new AuthException(ErrorCode.UNAUTHORIZED);
        }
        return UUID.fromString(authentication.getName());
    }
}
