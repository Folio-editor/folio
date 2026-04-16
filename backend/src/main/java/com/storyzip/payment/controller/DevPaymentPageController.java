package com.storyzip.payment.controller;

import com.storyzip.payment.config.TossPaymentsProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Profile;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * 개발 환경 결제 테스트용 HTML 서빙 + 클라이언트 키 공개.
 *
 * <p>전역 정적 리소스 매핑을 끈 상태이므로 classpath에서 직접 읽어 반환한다.
 * {@code dev} 프로필에서만 활성화.
 */
@Profile("dev")
@RestController
@RequiredArgsConstructor
public class DevPaymentPageController {

    private final TossPaymentsProperties properties;

    @GetMapping(value = "/test-payment.html", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> testPaymentPage() throws Exception {
        ClassPathResource resource = new ClassPathResource("static/test-payment.html");
        String html = new String(resource.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        return ResponseEntity.ok()
                .header("Cache-Control", "no-store")
                .body(html);
    }

    /** 토스 클라이언트 키는 공개값이라 dev 환경 편의상 내려준다. */
    @GetMapping("/api/v1/payments/dev/client-key")
    public Map<String, String> clientKey() {
        return Map.of("clientKey", properties.clientKey());
    }
}
