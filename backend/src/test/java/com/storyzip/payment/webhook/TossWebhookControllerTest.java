package com.storyzip.payment.webhook;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.storyzip.common.exception.PaymentException;
import com.storyzip.payment.config.TossPaymentsProperties;
import com.storyzip.payment.domain.PaymentEvent;
import com.storyzip.payment.repository.PaymentEventRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class TossWebhookControllerTest {

    private static final String WEBHOOK_SECRET = "test-webhook-secret-key";

    @Mock
    PaymentEventRepository paymentEventRepository;

    ObjectMapper objectMapper = new ObjectMapper();

    TossWebhookController controller;

    @BeforeEach
    void setUp() {
        TossPaymentsProperties props = new TossPaymentsProperties(
                "test_ck", "test_sk", "https://api.tosspayments.com", WEBHOOK_SECRET);
        controller = new TossWebhookController(paymentEventRepository, objectMapper, props);
    }

    private String sign(String body) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(WEBHOOK_SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return Base64.getEncoder().encodeToString(mac.doFinal(body.getBytes(StandardCharsets.UTF_8)));
    }

    @Test
    @DisplayName("최초 수신 이벤트는 payment_event에 저장되고 200을 반환한다")
    void firstEvent_storedAndReturns200() throws Exception {
        String body = """
                {"eventId":"evt_001","eventType":"PAYMENT.DONE","data":{"paymentKey":"pk_1","status":"DONE"}}""";
        given(paymentEventRepository.existsByEventId("evt_001")).willReturn(false);

        ResponseEntity<Void> response = controller.receive(sign(body), body);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);

        ArgumentCaptor<PaymentEvent> captor = ArgumentCaptor.forClass(PaymentEvent.class);
        verify(paymentEventRepository).save(captor.capture());
        PaymentEvent saved = captor.getValue();
        assertThat(saved.getEventId()).isEqualTo("evt_001");
        assertThat(saved.getEventType()).isEqualTo("PAYMENT.DONE");
        assertThat(saved.getPayload()).contains("pk_1");
    }

    @Test
    @DisplayName("eventId 중복 수신은 저장하지 않고 200 반환 (멱등성)")
    void duplicateEvent_skippedReturns200() throws Exception {
        String body = """
                {"eventId":"evt_001","eventType":"PAYMENT.DONE","data":{}}""";
        given(paymentEventRepository.existsByEventId("evt_001")).willReturn(true);

        ResponseEntity<Void> response = controller.receive(sign(body), body);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(paymentEventRepository, never()).save(any());
    }

    @Test
    @DisplayName("동시 중복 수신은 UNIQUE 위반을 삼키고 200 반환")
    void concurrentDuplicate_swallowsUniqueViolation() throws Exception {
        String body = """
                {"eventId":"evt_race","eventType":"PAYMENT.DONE","data":{}}""";
        given(paymentEventRepository.existsByEventId("evt_race")).willReturn(false);
        given(paymentEventRepository.save(any(PaymentEvent.class)))
                .willThrow(new DataIntegrityViolationException("unique violation"));

        ResponseEntity<Void> response = controller.receive(sign(body), body);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    @DisplayName("eventId 없으면 paymentKey+status 조합을 대체 키로 사용")
    void missingEventId_fallsBackToPaymentKeyStatus() throws Exception {
        String body = """
                {"eventType":"PAYMENT.DONE","data":{"paymentKey":"pk_42","status":"DONE"}}""";
        given(paymentEventRepository.existsByEventId("pk_42:DONE")).willReturn(false);

        ResponseEntity<Void> response = controller.receive(sign(body), body);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);

        ArgumentCaptor<PaymentEvent> captor = ArgumentCaptor.forClass(PaymentEvent.class);
        verify(paymentEventRepository).save(captor.capture());
        assertThat(captor.getValue().getEventId()).isEqualTo("pk_42:DONE");
    }

    @Test
    @DisplayName("eventId와 paymentKey 모두 없으면 저장하지 않고 200")
    void noIdentifier_skipsPersist() throws Exception {
        String body = """
                {"eventType":"UNKNOWN","data":{}}""";

        ResponseEntity<Void> response = controller.receive(sign(body), body);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(paymentEventRepository, never()).save(any());
    }

    @Test
    @DisplayName("서명이 없으면 WEBHOOK_SIGNATURE_INVALID 예외")
    void missingSignature_throwsException() {
        String body = """
                {"eventId":"evt_001","eventType":"PAYMENT.DONE","data":{}}""";

        assertThatThrownBy(() -> controller.receive(null, body))
                .isInstanceOf(PaymentException.class);
    }

    @Test
    @DisplayName("잘못된 서명이면 WEBHOOK_SIGNATURE_INVALID 예외")
    void invalidSignature_throwsException() {
        String body = """
                {"eventId":"evt_001","eventType":"PAYMENT.DONE","data":{}}""";

        assertThatThrownBy(() -> controller.receive("invalid-signature", body))
                .isInstanceOf(PaymentException.class);
    }

    @Test
    @DisplayName("webhookSecret 미설정 시 서명 검증을 우회하지 않고 거절한다")
    void missingSecret_rejectsRequest() throws Exception {
        TossPaymentsProperties propsWithoutSecret = new TossPaymentsProperties(
                "test_ck", "test_sk", "https://api.tosspayments.com", "");
        TossWebhookController controllerWithoutSecret =
                new TossWebhookController(paymentEventRepository, objectMapper, propsWithoutSecret);

        String body = """
                {"eventId":"evt_001","eventType":"PAYMENT.DONE","data":{}}""";

        assertThatThrownBy(() -> controllerWithoutSecret.receive(sign(body), body))
                .isInstanceOf(PaymentException.class);
        verify(paymentEventRepository, never()).save(any());
    }
}
