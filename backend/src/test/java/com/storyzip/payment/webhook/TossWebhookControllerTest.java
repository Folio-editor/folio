package com.storyzip.payment.webhook;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.storyzip.payment.domain.PaymentEvent;
import com.storyzip.payment.repository.PaymentEventRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class TossWebhookControllerTest {

    @Mock
    PaymentEventRepository paymentEventRepository;

    ObjectMapper objectMapper = new ObjectMapper();

    TossWebhookController controller;

    @BeforeEach
    void setUp() {
        controller = new TossWebhookController(paymentEventRepository, objectMapper);
    }

    @Test
    @DisplayName("최초 수신 이벤트는 payment_event에 저장되고 200을 반환한다")
    void firstEvent_storedAndReturns200() throws Exception {
        JsonNode body = objectMapper.readTree("""
                {"eventId":"evt_001","eventType":"PAYMENT.DONE",
                 "data":{"paymentKey":"pk_1","status":"DONE"}}
                """);
        given(paymentEventRepository.existsByEventId("evt_001")).willReturn(false);

        ResponseEntity<Void> response = controller.receive(body);

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
        JsonNode body = objectMapper.readTree("""
                {"eventId":"evt_001","eventType":"PAYMENT.DONE","data":{}}
                """);
        given(paymentEventRepository.existsByEventId("evt_001")).willReturn(true);

        ResponseEntity<Void> response = controller.receive(body);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(paymentEventRepository, never()).save(any());
    }

    @Test
    @DisplayName("동시 중복 수신은 UNIQUE 위반을 삼키고 200 반환")
    void concurrentDuplicate_swallowsUniqueViolation() throws Exception {
        JsonNode body = objectMapper.readTree("""
                {"eventId":"evt_race","eventType":"PAYMENT.DONE","data":{}}
                """);
        given(paymentEventRepository.existsByEventId("evt_race")).willReturn(false);
        given(paymentEventRepository.save(any(PaymentEvent.class)))
                .willThrow(new DataIntegrityViolationException("unique violation"));

        ResponseEntity<Void> response = controller.receive(body);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    @DisplayName("eventId 없으면 paymentKey+status 조합을 대체 키로 사용")
    void missingEventId_fallsBackToPaymentKeyStatus() throws Exception {
        JsonNode body = objectMapper.readTree("""
                {"eventType":"PAYMENT.DONE","data":{"paymentKey":"pk_42","status":"DONE"}}
                """);
        given(paymentEventRepository.existsByEventId("pk_42:DONE")).willReturn(false);

        ResponseEntity<Void> response = controller.receive(body);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);

        ArgumentCaptor<PaymentEvent> captor = ArgumentCaptor.forClass(PaymentEvent.class);
        verify(paymentEventRepository).save(captor.capture());
        assertThat(captor.getValue().getEventId()).isEqualTo("pk_42:DONE");
    }

    @Test
    @DisplayName("eventId와 paymentKey 모두 없으면 저장하지 않고 200")
    void noIdentifier_skipsPersist() throws Exception {
        JsonNode body = objectMapper.readTree("""
                {"eventType":"UNKNOWN","data":{}}
                """);

        ResponseEntity<Void> response = controller.receive(body);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(paymentEventRepository, never()).save(any());
    }
}
