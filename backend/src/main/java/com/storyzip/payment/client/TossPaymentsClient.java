package com.storyzip.payment.client;

import com.storyzip.common.exception.ErrorCode;
import com.storyzip.common.exception.PaymentException;
import com.storyzip.payment.config.TossPaymentsProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;

/**
 * 토스페이먼츠 HTTP 클라이언트.
 *
 * <p>Basic 인증: {@code secretKey:} 를 Base64 인코딩해 Authorization 헤더로 전달 (콜론 뒤는 비움).
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TossPaymentsClient {

    private final RestClient tossPaymentsRestClient;
    private final TossPaymentsProperties properties;

    /** 결제 승인 — paymentKey, orderId, amount 검증 후 DONE 상태로 전환. */
    public TossConfirmResponse confirmPayment(String paymentKey, String orderId, int amount) {
        try {
            return tossPaymentsRestClient.post()
                    .uri("/v1/payments/confirm")
                    .header(HttpHeaders.AUTHORIZATION, authHeader())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of(
                            "paymentKey", paymentKey,
                            "orderId", orderId,
                            "amount", amount
                    ))
                    .retrieve()
                    .body(TossConfirmResponse.class);
        } catch (RestClientResponseException e) {
            log.warn("Toss confirm failed: status={}, body={}", e.getStatusCode(), e.getResponseBodyAsString());
            throw new PaymentException(ErrorCode.PAYMENT_FAILED, e.getResponseBodyAsString());
        } catch (Exception e) {
            log.error("Toss confirm error", e);
            throw new PaymentException(ErrorCode.PAYMENT_GATEWAY_ERROR, e);
        }
    }

    private String authHeader() {
        String raw = properties.secretKey() + ":";
        return "Basic " + Base64.getEncoder()
                .encodeToString(raw.getBytes(StandardCharsets.UTF_8));
    }
}
