package com.storyzip.payment.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 포트원(PortOne) V2 연동 설정.
 *
 * <p>인증 방식: 모든 V2 API 호출에 {@code Authorization: PortOne {apiSecret}} 헤더를 사용한다.
 * (별도 token 발급 단계 없음. AccessToken 흐름도 지원되지만 단순화를 위해 정적 시크릿 헤더 사용.)
 *
 * <p>storeId / channelKey 는 프론트 SDK도 함께 사용하므로 브라우저에 노출 가능.
 * apiSecret 은 서버 only.
 */
@ConfigurationProperties(prefix = "portone")
public record PortOneProperties(
        String apiSecret,
        String storeId,
        String channelKeyOnetime,
        String channelKeyBilling,
        String apiBaseUrl,
        String webhookSecret
) {
}
