package com.storyzip.payment.scheduler;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.storyzip.auth.domain.Writer;
import com.storyzip.payment.domain.Payment;
import com.storyzip.payment.domain.PaymentEvent;
import com.storyzip.payment.domain.PaymentMethod;
import com.storyzip.payment.domain.PaymentStatus;
import com.storyzip.payment.repository.PaymentEventRepository;
import com.storyzip.payment.repository.PaymentRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;

@ExtendWith(MockitoExtension.class)
class PaymentEventProcessorTest {

    @Mock PaymentEventRepository paymentEventRepository;
    @Mock PaymentRepository paymentRepository;

    ObjectMapper objectMapper = new ObjectMapper();
    PaymentEventProcessor processor;

    Writer writer;
    UUID writerId;

    @BeforeEach
    void setUp() {
        processor = new PaymentEventProcessor(paymentEventRepository, paymentRepository, objectMapper);
        writerId = UUID.randomUUID();
        writer = Writer.builder().nickname("tester").email("t@t.com").oauthProvider("google").oauthId("123").build();
        ReflectionTestUtils.setField(writer, "id", writerId);
    }

    @Test
    @DisplayName("CANCELED 웹훅 이벤트가 DONE 결제를 CANCELED로 변경한다")
    void cancelEvent_updatesPaymentToCanceled() {
        Payment payment = Payment.builder()
                .writer(writer).orderId("SZ-001").amount(9900).tokenQty(20000).build();
        payment.markDone("pk_1", PaymentMethod.CARD, null);
        ReflectionTestUtils.setField(payment, "id", UUID.randomUUID());

        PaymentEvent event = PaymentEvent.builder()
                .eventId("evt_cancel_1")
                .eventType("PAYMENT_STATUS_CHANGED")
                .payload("{\"data\":{\"paymentKey\":\"pk_1\",\"status\":\"CANCELED\",\"cancels\":[{\"cancelReason\":\"고객 요청\"}]}}")
                .build();

        given(paymentRepository.findByPaymentKey("pk_1")).willReturn(Optional.of(payment));
        given(paymentEventRepository.findByConsumedFalseOrderByProcessedAtAsc()).willReturn(List.of(event));

        processor.processUnconsumedEvents();

        assertThat(payment.getStatus()).isEqualTo(PaymentStatus.CANCELED);
        assertThat(payment.getFailureReason()).isEqualTo("고객 요청");
        assertThat(event.isConsumed()).isTrue();
    }

    @Test
    @DisplayName("ABORTED 웹훅 이벤트가 미완료 결제를 FAILED로 변경한다")
    void abortedEvent_updatesPaymentToFailed() {
        Payment payment = Payment.builder()
                .writer(writer).orderId("SZ-002").amount(9900).tokenQty(20000).build();
        payment.markInProgress();
        ReflectionTestUtils.setField(payment, "id", UUID.randomUUID());

        PaymentEvent event = PaymentEvent.builder()
                .eventId("evt_abort_1")
                .eventType("PAYMENT_STATUS_CHANGED")
                .payload("{\"data\":{\"paymentKey\":\"pk_2\",\"status\":\"ABORTED\",\"failure\":{\"message\":\"카드 한도 초과\"}}}")
                .build();

        given(paymentRepository.findByPaymentKey("pk_2")).willReturn(Optional.of(payment));
        given(paymentEventRepository.findByConsumedFalseOrderByProcessedAtAsc()).willReturn(List.of(event));

        processor.processUnconsumedEvents();

        assertThat(payment.getStatus()).isEqualTo(PaymentStatus.FAILED);
        assertThat(payment.getFailureReason()).isEqualTo("카드 한도 초과");
        assertThat(event.isConsumed()).isTrue();
    }

    @Test
    @DisplayName("매칭되는 Payment가 없으면 이벤트만 consumed 처리한다")
    void noMatchingPayment_marksConsumed() {
        PaymentEvent event = PaymentEvent.builder()
                .eventId("evt_orphan")
                .eventType("PAYMENT_STATUS_CHANGED")
                .payload("{\"data\":{\"paymentKey\":\"pk_unknown\",\"status\":\"CANCELED\"}}")
                .build();

        given(paymentRepository.findByPaymentKey("pk_unknown")).willReturn(Optional.empty());
        given(paymentEventRepository.findByConsumedFalseOrderByProcessedAtAsc()).willReturn(List.of(event));

        processor.processUnconsumedEvents();

        assertThat(event.isConsumed()).isTrue();
    }

    @Test
    @DisplayName("이미 DONE인 결제에 ABORTED 이벤트가 오면 무시한다")
    void donePayment_ignoresAborted() {
        Payment payment = Payment.builder()
                .writer(writer).orderId("SZ-003").amount(9900).tokenQty(20000).build();
        payment.markDone("pk_3", PaymentMethod.CARD, null);
        ReflectionTestUtils.setField(payment, "id", UUID.randomUUID());

        PaymentEvent event = PaymentEvent.builder()
                .eventId("evt_late_abort")
                .eventType("PAYMENT_STATUS_CHANGED")
                .payload("{\"data\":{\"paymentKey\":\"pk_3\",\"status\":\"ABORTED\",\"failure\":{\"message\":\"too late\"}}}")
                .build();

        given(paymentRepository.findByPaymentKey("pk_3")).willReturn(Optional.of(payment));
        given(paymentEventRepository.findByConsumedFalseOrderByProcessedAtAsc()).willReturn(List.of(event));

        processor.processUnconsumedEvents();

        assertThat(payment.getStatus()).isEqualTo(PaymentStatus.DONE);
        assertThat(event.isConsumed()).isTrue();
    }
}
