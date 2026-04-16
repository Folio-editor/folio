package com.storyzip.auth.controller;

import com.storyzip.auth.domain.Role;
import com.storyzip.auth.domain.Writer;
import com.storyzip.auth.jwt.JwtProvider;
import com.storyzip.auth.repository.WriterRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 개발 환경 전용 테스트 로그인.
 *
 * <p>Google OAuth PKCE 없이 이메일만으로 writer 생성/조회 후 JWT를 발급한다.
 * Postman/Swagger 수동 테스트용. {@code dev} 프로필에서만 활성화되므로 운영 빌드엔 노출되지 않는다.
 */
@Slf4j
@Profile("dev")
@RestController
@RequestMapping("/api/v1/auth/dev")
@RequiredArgsConstructor
public class DevAuthController {

    private final WriterRepository writerRepository;
    private final JwtProvider jwtProvider;

    @PostMapping("/login")
    @Transactional
    public ResponseEntity<DevLoginResponse> login(@Valid @RequestBody DevLoginRequest request) {
        Writer writer = writerRepository.findByEmail(request.email())
                .orElseGet(() -> writerRepository.save(Writer.builder()
                        .email(request.email())
                        .nickname(request.email().split("@")[0])
                        .role(Role.USER)
                        .build()));

        String accessToken = jwtProvider.createAccessToken(
                writer.getId(), writer.getEmail(), writer.getRole().name());

        log.info("[DEV] Issued access token for writerId={}, email={}", writer.getId(), writer.getEmail());
        return ResponseEntity.ok(new DevLoginResponse(accessToken, writer.getId().toString(), writer.getEmail()));
    }

    public record DevLoginRequest(@NotBlank @Email String email) {}

    public record DevLoginResponse(String accessToken, String writerId, String email) {}
}
