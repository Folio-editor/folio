package com.storyzip.payment.client;

import com.storyzip.common.circuitbreaker.CircuitBreaker;
import com.storyzip.common.exception.ErrorCode;
import com.storyzip.common.exception.PaymentException;
import com.storyzip.common.observability.ExternalCallLogger;
import com.storyzip.payment.config.TossPaymentsProperties;
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
 *
 * <p>서킷브레이커: 연속 5회 실패 시 30초간 OPEN 상태로 전환해
 * 토스 장애가 우리 서비스 전체 응답 지연으로 전파되는 것을 차단한다.
 */
@Slf4j
@Component
public class TossPaymentsClient {

    private static final int FAILURE_THRESHOLD = 5;
    private static final long OPEN_DURATION_MILLIS = 30_000;
    /** 토스 API SLA — 결제 승인은 사용자 대기시간이라 5초가 한계. */
    private static final long TOSS_SLA_MS = 5_000L;

    private final RestClient tossPaymentsRestClient;
    private final TossPaymentsProperties properties;
    private final CircuitBreaker circuitBreaker;

    public TossPaymentsClient(RestClient tossPaymentsRestClient, TossPaymentsProperties properties) {
        this.tossPaymentsRestClient = tossPaymentsRestClient;
        this.properties = properties;
        this.circuitBreaker = new CircuitBreaker(FAILURE_THRESHOLD, OPEN_DURATION_MILLIS, "toss-payments");
    }

    /** 결제 승인 — paymentKey, orderId, amount 검증 후 DONE 상태로 전환. */
    public TossConfirmResponse confirmPayment(String paymentKey, String orderId, int amount) {
        return circuitBreaker.execute(
                () -> ExternalCallLogger.measure(ExternalCallLogger.SYSTEM_TOSS, "confirmPayment", TOSS_SLA_MS,
                        () -> doConfirmPayment(paymentKey, orderId, amount)),
                () -> { throw new PaymentException(ErrorCode.PAYMENT_GATEWAY_ERROR,
                        "결제 게이트웨이 일시 장애 (서킷브레이커 OPEN)"); }
        );
    }

    private TossConfirmResponse doConfirmPayment(String paymentKey, String orderId, int amount) {
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

    /**
     * 빌링키 발급 — 프론트에서 받은 {@code authKey}를 장기 식별자인 {@code billingKey}로 교환한다.
     * {@code POST /v1/billing/authorizations/issue}.
     */
    public TossBillingAuthResponse issueBillingKey(String authKey, String customerKey) {
        return circuitBreaker.execute(
                () -> ExternalCallLogger.measure(ExternalCallLogger.SYSTEM_TOSS, "issueBillingKey", TOSS_SLA_MS,
                        () -> doIssueBillingKey(authKey, customerKey)),
                () -> { throw new PaymentException(ErrorCode.PAYMENT_GATEWAY_ERROR,
                        "결제 게이트웨이 일시 장애 (서킷브레이커 OPEN)"); }
        );
    }

    private TossBillingAuthResponse doIssueBillingKey(String authKey, String customerKey) {
        try {
            return tossPaymentsRestClient.post()
                    .uri("/v1/billing/authorizations/issue")
                    .header(HttpHeaders.AUTHORIZATION, authHeader())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of(
                            "authKey", authKey,
                            "customerKey", customerKey
                    ))
                    .retrieve()
                    .body(TossBillingAuthResponse.class);
        } catch (RestClientResponseException e) {
            log.warn("Toss billing auth failed: status={}, body={}", e.getStatusCode(), e.getResponseBodyAsString());
            throw new PaymentException(ErrorCode.PAYMENT_FAILED, e.getResponseBodyAsString());
        } catch (Exception e) {
            log.error("Toss billing auth error", e);
            throw new PaymentException(ErrorCode.PAYMENT_GATEWAY_ERROR, e);
        }
    }

    /**
     * 빌링키로 결제 실행 — 구독 첫 결제·정기 갱신 모두 동일 엔드포인트.
     * {@code POST /v1/billing/{billingKey}}.
     */
    public TossConfirmResponse chargeBilling(String billingKey, String customerKey,
                                             String orderId, String orderName,
                                             int amount, String customerEmail) {
        return circuitBreaker.execute(
                () -> ExternalCallLogger.measure(ExternalCallLogger.SYSTEM_TOSS, "chargeBilling", TOSS_SLA_MS,
                        () -> doChargeBilling(billingKey, customerKey, orderId, orderName, amount, customerEmail)),
                () -> { throw new PaymentException(ErrorCode.PAYMENT_GATEWAY_ERROR,
                        "결제 게이트웨이 일시 장애 (서킷브레이커 OPEN)"); }
        );
    }

    private TossConfirmResponse doChargeBilling(String billingKey, String customerKey,
                                                String orderId, String orderName,
                                                int amount, String customerEmail) {
        try {
            Map<String, Object> body = new java.util.HashMap<>();
            body.put("customerKey", customerKey);
            body.put("amount", amount);
            body.put("orderId", orderId);
            body.put("orderName", orderName);
            if (customerEmail != null) body.put("customerEmail", customerEmail);

            return tossPaymentsRestClient.post()
                    .uri("/v1/billing/{billingKey}", billingKey)
                    .header(HttpHeaders.AUTHORIZATION, authHeader())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(TossConfirmResponse.class);
        } catch (RestClientResponseException e) {
            log.warn("Toss billing charge failed: status={}, body={}", e.getStatusCode(), e.getResponseBodyAsString());
            throw new PaymentException(ErrorCode.PAYMENT_FAILED, e.getResponseBodyAsString());
        } catch (Exception e) {
            log.error("Toss billing charge error", e);
            throw new PaymentException(ErrorCode.PAYMENT_GATEWAY_ERROR, e);
        }
    }

    /**
     * 결제 취소(환불) — 전액 또는 부분 취소.
     * {@code POST /v1/payments/{paymentKey}/cancel}.
     */
    public TossConfirmResponse cancelPayment(String paymentKey, String cancelReason, Integer cancelAmount) {
        return circuitBreaker.execute(
                () -> ExternalCallLogger.measure(ExternalCallLogger.SYSTEM_TOSS, "cancelPayment", TOSS_SLA_MS,
                        () -> doCancelPayment(paymentKey, cancelReason, cancelAmount)),
                () -> { throw new PaymentException(ErrorCode.PAYMENT_GATEWAY_ERROR,
                        "결제 게이트웨이 일시 장애 (서킷브레이커 OPEN)"); }
        );
    }

    private TossConfirmResponse doCancelPayment(String paymentKey, String cancelReason, Integer cancelAmount) {
        try {
            Map<String, Object> body = new java.util.HashMap<>();
            body.put("cancelReason", cancelReason);
            if (cancelAmount != null) body.put("cancelAmount", cancelAmount);

            return tossPaymentsRestClient.post()
                    .uri("/v1/payments/{paymentKey}/cancel", paymentKey)
                    .header(HttpHeaders.AUTHORIZATION, authHeader())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(TossConfirmResponse.class);
        } catch (RestClientResponseException e) {
            log.warn("Toss cancel failed: status={}, body={}", e.getStatusCode(), e.getResponseBodyAsString());
            throw new PaymentException(ErrorCode.REFUND_FAILED, e.getResponseBodyAsString());
        } catch (Exception e) {
            log.error("Toss cancel error", e);
            throw new PaymentException(ErrorCode.PAYMENT_GATEWAY_ERROR, e);
        }
    }

    private String authHeader() {
        String raw = properties.secretKey() + ":";
        return "Basic " + Base64.getEncoder()
                .encodeToString(raw.getBytes(StandardCharsets.UTF_8));
    }
}
