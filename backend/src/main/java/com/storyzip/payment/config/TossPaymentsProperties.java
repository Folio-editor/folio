package com.storyzip.payment.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 토스페이먼츠 연동 설정.
 *
 * <p>개발 단계에서는 문서용 테스트 키를 그대로 사용해도 되고,
 * 운영 심사 완료 후 라이브 키로 교체한다. 시크릿 키는 서버에서만 보관한다.
 */
@ConfigurationProperties(prefix = "toss.payments")
public record TossPaymentsProperties(
        String clientKey,
        String secretKey,
        String apiBaseUrl,
        String webhookSecret
) {
}
