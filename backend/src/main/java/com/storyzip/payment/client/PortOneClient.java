package com.storyzip.payment.client;

import com.storyzip.common.circuitbreaker.CircuitBreaker;
import com.storyzip.common.exception.ErrorCode;
import com.storyzip.common.exception.PaymentException;
import com.storyzip.common.observability.ExternalCallLogger;
import com.storyzip.payment.config.PortOneProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.util.HashMap;
import java.util.Map;

/**
 * 포트원(PortOne) V2 HTTP 클라이언트.
 *
 * <p>인증: {@code Authorization: PortOne {apiSecret}} 헤더 (Bearer 아님).
 *
 * <p>서킷브레이커: 연속 5회 실패 시 30초간 OPEN 상태로 전환해 외부 장애 전파 차단.
 *
 * <p>주요 차이점 (vs 토스):
 * <ul>
 *   <li>결제 승인 단계 없음 — SDK가 PG와 직접 통신, 서버는 paymentId로 상태만 verify
 *   <li>billingKey 교환(authKey → billingKey) 단계 없음 — SDK가 직접 billingKey 반환
 *   <li>정기결제 청구는 paymentId 신규 채번 후 {@code POST /payments/{paymentId}/billing-key}
 * </ul>
 */
@Slf4j
@Component
public class PortOneClient {

    private static final int FAILURE_THRESHOLD = 5;
    private static final long OPEN_DURATION_MILLIS = 30_000;
    /** 포트원 API SLA — 결제 검증/빌링 청구는 사용자 대기시간이라 5초 한계. */
    private static final long PORTONE_SLA_MS = 5_000L;
    private static final String SYSTEM_NAME = "portone";

    private final RestClient portOneRestClient;
    private final PortOneProperties properties;
    private final CircuitBreaker circuitBreaker;

    public PortOneClient(RestClient portOneRestClient, PortOneProperties properties) {
        this.portOneRestClient = portOneRestClient;
        this.properties = properties;
        this.circuitBreaker = new CircuitBreaker(FAILURE_THRESHOLD, OPEN_DURATION_MILLIS, "portone");
    }

    /** 결제 단건 조회 — paymentId로 status/amount 검증. SDK가 redirect한 직후 위변조 검증에 사용. */
    public PortOnePaymentResponse getPayment(String paymentId) {
        return circuitBreaker.execute(
                () -> ExternalCallLogger.measure(SYSTEM_NAME, "getPayment", PORTONE_SLA_MS,
                        () -> doGetPayment(paymentId)),
                () -> { throw new PaymentException(ErrorCode.PAYMENT_GATEWAY_ERROR,
                        "결제 게이트웨이 일시 장애 (서킷브레이커 OPEN)"); }
        );
    }

    private PortOnePaymentResponse doGetPayment(String paymentId) {
        try {
            return portOneRestClient.get()
                    .uri("/payments/{paymentId}", paymentId)
                    .header(HttpHeaders.AUTHORIZATION, authHeader())
                    .retrieve()
                    .body(PortOnePaymentResponse.class);
        } catch (RestClientResponseException e) {
            log.warn("PortOne getPayment failed: status={}, body={}", e.getStatusCode(), e.getResponseBodyAsString());
            throw new PaymentException(ErrorCode.PAYMENT_FAILED, e.getResponseBodyAsString());
        } catch (Exception e) {
            log.error("PortOne getPayment error", e);
            throw new PaymentException(ErrorCode.PAYMENT_GATEWAY_ERROR, e);
        }
    }

    /**
     * 빌링키로 결제 청구 — 정기결제 첫 결제 + 매월 갱신 모두 동일 엔드포인트.
     * {@code POST /payments/{paymentId}/billing-key}.
     *
     * <p>paymentId는 매 청구마다 신규 채번해야 한다 (포트원은 paymentId 단위 멱등).
     */
    public PortOnePaymentResponse chargeBilling(String paymentId, String billingKey,
                                                String orderName, int amount,
                                                String customerId, String customerEmail) {
        return circuitBreaker.execute(
                () -> ExternalCallLogger.measure(SYSTEM_NAME, "chargeBilling", PORTONE_SLA_MS,
                        () -> doChargeBilling(paymentId, billingKey, orderName, amount, customerId, customerEmail)),
                () -> { throw new PaymentException(ErrorCode.PAYMENT_GATEWAY_ERROR,
                        "결제 게이트웨이 일시 장애 (서킷브레이커 OPEN)"); }
        );
    }

    private PortOnePaymentResponse doChargeBilling(String paymentId, String billingKey,
                                                   String orderName, int amount,
                                                   String customerId, String customerEmail) {
        try {
            Map<String, Object> customer = new HashMap<>();
            customer.put("id", customerId);
            if (customerEmail != null) customer.put("email", customerEmail);

            Map<String, Object> body = new HashMap<>();
            body.put("billingKey", billingKey);
            body.put("orderName", orderName);
            body.put("customer", customer);
            body.put("amount", Map.of("total", amount));
            body.put("currency", "KRW");

            return portOneRestClient.post()
                    .uri("/payments/{paymentId}/billing-key", paymentId)
                    .header(HttpHeaders.AUTHORIZATION, authHeader())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(PortOnePaymentResponse.class);
        } catch (RestClientResponseException e) {
            log.warn("PortOne chargeBilling failed: status={}, body={}", e.getStatusCode(), e.getResponseBodyAsString());
            throw new PaymentException(ErrorCode.PAYMENT_FAILED, e.getResponseBodyAsString());
        } catch (Exception e) {
            log.error("PortOne chargeBilling error", e);
            throw new PaymentException(ErrorCode.PAYMENT_GATEWAY_ERROR, e);
        }
    }

    /**
     * 결제 취소(환불) — 전액 또는 부분 취소.
     * {@code POST /payments/{paymentId}/cancel}.
     */
    public void cancelPayment(String paymentId, String reason, Integer cancelAmount) {
        circuitBreaker.execute(
                () -> ExternalCallLogger.measure(SYSTEM_NAME, "cancelPayment", PORTONE_SLA_MS,
                        () -> { doCancelPayment(paymentId, reason, cancelAmount); return null; }),
                () -> { throw new PaymentException(ErrorCode.PAYMENT_GATEWAY_ERROR,
                        "결제 게이트웨이 일시 장애 (서킷브레이커 OPEN)"); }
        );
    }

    private void doCancelPayment(String paymentId, String reason, Integer cancelAmount) {
        try {
            Map<String, Object> body = new HashMap<>();
            body.put("reason", reason);
            if (cancelAmount != null) body.put("amount", cancelAmount);

            portOneRestClient.post()
                    .uri("/payments/{paymentId}/cancel", paymentId)
                    .header(HttpHeaders.AUTHORIZATION, authHeader())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientResponseException e) {
            log.warn("PortOne cancel failed: status={}, body={}", e.getStatusCode(), e.getResponseBodyAsString());
            throw new PaymentException(ErrorCode.REFUND_FAILED, e.getResponseBodyAsString());
        } catch (Exception e) {
            log.error("PortOne cancel error", e);
            throw new PaymentException(ErrorCode.PAYMENT_GATEWAY_ERROR, e);
        }
    }

    private String authHeader() {
        return "PortOne " + properties.apiSecret();
    }
}
