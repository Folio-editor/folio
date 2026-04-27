package com.storyzip.payment.service;

import com.storyzip.auth.domain.Writer;
import com.storyzip.common.exception.ErrorCode;
import com.storyzip.common.exception.PaymentException;
import com.storyzip.payment.client.TossConfirmResponse;
import com.storyzip.payment.client.TossPaymentsClient;
import com.storyzip.payment.domain.Payment;
import com.storyzip.payment.domain.PaymentMethod;
import com.storyzip.payment.domain.PaymentStatus;
import com.storyzip.payment.dto.RefundResponse;
import com.storyzip.payment.repository.PaymentRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class RefundServiceTest {

    @Mock PaymentRepository paymentRepository;
    @Mock TossPaymentsClient tossPaymentsClient;
    @Mock TokenWalletService tokenWalletService;
    @InjectMocks RefundService refundService;

    Writer writer;
    UUID writerId;

    @BeforeEach
    void setUp() {
        writerId = UUID.randomUUID();
        writer = Writer.builder().nickname("tester").email("t@t.com").oauthProvider("google").oauthId("123").build();
        ReflectionTestUtils.setField(writer, "id", writerId);
    }

    private Payment createDonePayment(String orderId, int amount, int tokenQty, LocalDateTime approvedAt) {
        Payment payment = Payment.builder()
                .writer(writer).orderId(orderId).amount(amount).tokenQty(tokenQty).build();
        payment.markDone("pk_" + orderId, PaymentMethod.CARD, approvedAt);
        ReflectionTestUtils.setField(payment, "id", UUID.randomUUID());
        ReflectionTestUtils.setField(payment, "createdAt", approvedAt);
        return payment;
    }

    @Test
    @DisplayName("24시간 이내 환불은 전액 환불된다")
    void within24h_fullRefund() {
        Payment payment = createDonePayment("SZ-001", 9_900, 25_000,
                LocalDateTime.now().minusHours(12));
        given(paymentRepository.findWithLockByOrderId("SZ-001")).willReturn(Optional.of(payment));
        given(tossPaymentsClient.cancelPayment(anyString(), anyString(), isNull()))
                .willReturn(new TossConfirmResponse("pk_SZ-001", "SZ-001", "CANCELED", "카드", 9_900, null));

        RefundResponse response = refundService.refund(writerId, "SZ-001");

        assertThat(response.refundType()).isEqualTo("FULL");
        assertThat(response.refundAmount()).isEqualTo(9_900);
        assertThat(response.tokenDeducted()).isEqualTo(25_000);
        assertThat(payment.getStatus()).isEqualTo(PaymentStatus.CANCELED);
        verify(tossPaymentsClient).cancelPayment(eq("pk_SZ-001"), eq("24시간 이내 전액 환불"), isNull());
        verify(tokenWalletService).deductForRefund(eq(writerId), eq(25_000), anyString(), any());
    }

    @Test
    @DisplayName("24시간 이후 환불은 잔여 일수 비례 부분 환불된다")
    void after24h_partialRefund() {
        // 10일 전 결제 → 잔여 약 20일 (자정 경계로 ±1일 가능) → 비례 부분 환불
        // production은 UTC로 비교하므로 테스트도 UTC 기준으로 시각을 만든다.
        Payment payment = createDonePayment("SZ-002", 9_900, 25_000,
                LocalDateTime.now(java.time.ZoneOffset.UTC).minusDays(10));
        given(paymentRepository.findWithLockByOrderId("SZ-002")).willReturn(Optional.of(payment));
        given(tossPaymentsClient.cancelPayment(anyString(), anyString(), anyInt()))
                .willAnswer(inv -> new TossConfirmResponse(
                        "pk_SZ-002", "SZ-002", "CANCELED", "카드",
                        inv.getArgument(2), null));

        RefundResponse response = refundService.refund(writerId, "SZ-002");

        assertThat(response.refundType()).isEqualTo("PARTIAL");
        // 자정 경계에서 daysUsed가 9 또는 10이 될 수 있어 두 값 모두 허용.
        assertThat(response.refundAmount()).isIn(6_600, 6_930);
        assertThat(response.tokenDeducted()).isIn(16_666, 17_500);
    }

    @Test
    @DisplayName("30일 경과 후에는 환불할 수 없다")
    void after30days_refundDenied() {
        Payment payment = createDonePayment("SZ-003", 9_900, 25_000,
                LocalDateTime.now().minusDays(31));
        given(paymentRepository.findWithLockByOrderId("SZ-003")).willReturn(Optional.of(payment));

        assertThatThrownBy(() -> refundService.refund(writerId, "SZ-003"))
                .isInstanceOf(PaymentException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.REFUND_FAILED);
    }

    @Test
    @DisplayName("DONE이 아닌 결제는 환불할 수 없다")
    void notDone_refundDenied() {
        Payment payment = Payment.builder()
                .writer(writer).orderId("SZ-004").amount(9_900).tokenQty(25_000).build();
        ReflectionTestUtils.setField(payment, "id", UUID.randomUUID());
        given(paymentRepository.findWithLockByOrderId("SZ-004")).willReturn(Optional.of(payment));

        assertThatThrownBy(() -> refundService.refund(writerId, "SZ-004"))
                .isInstanceOf(PaymentException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.REFUND_FAILED);

        verify(tossPaymentsClient, never()).cancelPayment(anyString(), anyString(), any());
    }

    @Test
    @DisplayName("다른 유저의 결제는 환불할 수 없다")
    void otherUser_forbidden() {
        Payment payment = createDonePayment("SZ-005", 9_900, 25_000, LocalDateTime.now());
        given(paymentRepository.findWithLockByOrderId("SZ-005")).willReturn(Optional.of(payment));

        UUID otherWriterId = UUID.randomUUID();

        assertThatThrownBy(() -> refundService.refund(otherWriterId, "SZ-005"))
                .isInstanceOf(PaymentException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FORBIDDEN);
    }
}
