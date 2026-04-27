package com.storyzip.payment.service;

import com.storyzip.auth.domain.Writer;
import com.storyzip.auth.repository.WriterRepository;
import com.storyzip.common.exception.ErrorCode;
import com.storyzip.common.exception.PaymentException;
import com.storyzip.payment.client.TossConfirmResponse;
import com.storyzip.payment.client.TossPaymentsClient;
import com.storyzip.payment.config.TossPaymentsProperties;
import com.storyzip.payment.domain.Payment;
import com.storyzip.payment.domain.PaymentMethod;
import com.storyzip.payment.domain.PaymentStatus;
import com.storyzip.payment.dto.ConfirmPaymentRequest;
import com.storyzip.payment.dto.CreatePaymentRequest;
import com.storyzip.payment.dto.CreatePaymentResponse;
import com.storyzip.payment.dto.PaymentResponse;
import com.storyzip.payment.repository.PaymentRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class PaymentServiceTest {

    @Mock
    PaymentRepository paymentRepository;
    @Mock
    WriterRepository writerRepository;
    @Mock
    TossPaymentsClient tossPaymentsClient;
    @Mock
    TokenWalletService tokenWalletService;
    @Mock
    TossPaymentsProperties tossProperties;

    @InjectMocks
    PaymentService paymentService;

    UUID writerId;
    Writer writer;

    @BeforeEach
    void setUp() {
        writerId = UUID.randomUUID();
        writer = Writer.builder().email("w@storyzip.app").nickname("w").build();
        ReflectionTestUtils.setField(writer, "id", writerId);
    }

    // ===== createPayment =====

    @Test
    @DisplayName("createPayment: 서버가 패키지 코드로 금액/수량을 확정해 READY 상태로 저장한다")
    void createPayment_savesReadyOrderWithServerSidePricing() {
        given(writerRepository.findById(writerId)).willReturn(Optional.of(writer));
        given(paymentRepository.save(any(Payment.class))).willAnswer(inv -> inv.getArgument(0));
        given(tossProperties.clientKey()).willReturn("test_ck_xxx");

        CreatePaymentResponse response = paymentService.createPayment(
                writerId, new CreatePaymentRequest("TOKEN_550"));

        assertThat(response.amount()).isEqualTo(5_000);
        assertThat(response.tokenQty()).isEqualTo(550);
        assertThat(response.orderId()).startsWith("SZ-");
        assertThat(response.orderName()).contains("550");
        assertThat(response.clientKey()).isEqualTo("test_ck_xxx");

        ArgumentCaptor<Payment> captor = ArgumentCaptor.forClass(Payment.class);
        verify(paymentRepository).save(captor.capture());
        Payment saved = captor.getValue();
        assertThat(saved.getStatus()).isEqualTo(PaymentStatus.READY);
        assertThat(saved.getAmount()).isEqualTo(5_000);
        assertThat(saved.getTokenQty()).isEqualTo(550);
    }

    @Test
    @DisplayName("createPayment: 존재하지 않는 작가면 WRITER_NOT_FOUND")
    void createPayment_writerNotFound() {
        given(writerRepository.findById(writerId)).willReturn(Optional.empty());

        assertThatThrownBy(() -> paymentService.createPayment(
                writerId, new CreatePaymentRequest("TOKEN_300")))
                .isInstanceOf(PaymentException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.WRITER_NOT_FOUND);
    }

    @Test
    @DisplayName("createPayment: 알 수 없는 패키지 코드면 INVALID_REQUEST")
    void createPayment_unknownPackage() {
        given(writerRepository.findById(writerId)).willReturn(Optional.of(writer));

        assertThatThrownBy(() -> paymentService.createPayment(
                writerId, new CreatePaymentRequest("TOKEN_HACK_1")))
                .isInstanceOf(PaymentException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.INVALID_REQUEST);
    }

    // ===== confirmPayment =====

    @Test
    @DisplayName("confirmPayment: 토스 승인 성공 시 DONE 전환 + 토큰 충전 호출")
    void confirmPayment_success() {
        Payment ready = Payment.builder()
                .writer(writer).orderId("SZ-ABC").amount(9_900).tokenQty(20_000).build();
        UUID paymentId = UUID.randomUUID();
        ReflectionTestUtils.setField(ready, "id", paymentId);

        given(paymentRepository.findByOrderId("SZ-ABC")).willReturn(Optional.of(ready));
        given(tossPaymentsClient.confirmPayment("pk_1", "SZ-ABC", 9_900))
                .willReturn(new TossConfirmResponse(
                        "pk_1", "SZ-ABC", "DONE", "카드", 9_900,
                        OffsetDateTime.parse("2026-04-15T10:30:00+09:00")));

        PaymentResponse response = paymentService.confirmPayment(
                writerId, new ConfirmPaymentRequest("pk_1", "SZ-ABC", 9_900));

        assertThat(response.status()).isEqualTo(PaymentStatus.DONE);
        assertThat(response.paymentKey()).isEqualTo("pk_1");
        assertThat(response.method()).isEqualTo(PaymentMethod.CARD);
        assertThat(response.approvedAt()).isNotNull();

        verify(tokenWalletService).chargePurchase(
                eq(writerId), eq(20_000),
                eq("PAYMENT_SZ-ABC"),
                eq(paymentId));
    }

    @Test
    @DisplayName("confirmPayment: 다른 사람의 주문은 FORBIDDEN — 토스 호출·충전 모두 안 됨")
    void confirmPayment_foreignOrder_forbidden() {
        Payment ready = Payment.builder()
                .writer(writer).orderId("SZ-ABC").amount(9_900).tokenQty(20_000).build();
        given(paymentRepository.findByOrderId("SZ-ABC")).willReturn(Optional.of(ready));

        UUID otherWriter = UUID.randomUUID();
        assertThatThrownBy(() -> paymentService.confirmPayment(
                otherWriter, new ConfirmPaymentRequest("pk_1", "SZ-ABC", 9_900)))
                .isInstanceOf(PaymentException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FORBIDDEN);

        verify(tossPaymentsClient, never()).confirmPayment(anyString(), anyString(), anyInt());
        verify(tokenWalletService, never()).chargePurchase(any(), anyInt(), anyString(), any());
    }

    @Test
    @DisplayName("confirmPayment: 클라이언트가 조작한 amount는 토스 호출 전에 AMOUNT_MISMATCH")
    void confirmPayment_amountMismatch_rejectedBeforeGateway() {
        Payment ready = Payment.builder()
                .writer(writer).orderId("SZ-ABC").amount(9_900).tokenQty(20_000).build();
        given(paymentRepository.findByOrderId("SZ-ABC")).willReturn(Optional.of(ready));

        assertThatThrownBy(() -> paymentService.confirmPayment(
                writerId, new ConfirmPaymentRequest("pk_1", "SZ-ABC", 100)))
                .isInstanceOf(PaymentException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.PAYMENT_AMOUNT_MISMATCH);

        verify(tossPaymentsClient, never()).confirmPayment(anyString(), anyString(), anyInt());
        verify(tokenWalletService, never()).chargePurchase(any(), anyInt(), anyString(), any());
    }

    @Test
    @DisplayName("confirmPayment: 이미 DONE 된 주문은 재호출해도 멱등하게 성공 응답 반환 (이중 충전 방지)")
    void confirmPayment_alreadyDone_idempotentSuccess() {
        Payment done = Payment.builder()
                .writer(writer).orderId("SZ-ABC").amount(9_900).tokenQty(20_000).build();
        done.markDone("pk_1", PaymentMethod.CARD, null);
        ReflectionTestUtils.setField(done, "id", UUID.randomUUID());

        given(paymentRepository.findByPaymentKey("pk_1")).willReturn(Optional.of(done));

        PaymentResponse response = paymentService.confirmPayment(
                writerId, new ConfirmPaymentRequest("pk_1", "SZ-ABC", 9_900));

        assertThat(response).isNotNull();
        assertThat(response.orderId()).isEqualTo("SZ-ABC");
        verify(tossPaymentsClient, never()).confirmPayment(anyString(), anyString(), anyInt());
        verify(tokenWalletService, never()).chargePurchase(any(), anyInt(), anyString(), any());
    }

    @Test
    @DisplayName("confirmPayment: 존재하지 않는 주문은 PAYMENT_NOT_FOUND")
    void confirmPayment_notFound() {
        given(paymentRepository.findByOrderId("SZ-NOPE")).willReturn(Optional.empty());

        assertThatThrownBy(() -> paymentService.confirmPayment(
                writerId, new ConfirmPaymentRequest("pk_1", "SZ-NOPE", 9_900)))
                .isInstanceOf(PaymentException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.PAYMENT_NOT_FOUND);
    }

    @Test
    @DisplayName("confirmPayment: 토스가 PAYMENT_FAILED 예외를 던지면 토큰 충전은 일어나지 않는다")
    void confirmPayment_tossFails_noTokenCharge() {
        Payment ready = Payment.builder()
                .writer(writer).orderId("SZ-ABC").amount(9_900).tokenQty(20_000).build();
        given(paymentRepository.findByOrderId("SZ-ABC")).willReturn(Optional.of(ready));
        given(tossPaymentsClient.confirmPayment("pk_1", "SZ-ABC", 9_900))
                .willThrow(new PaymentException(ErrorCode.PAYMENT_FAILED, "card declined"));

        assertThatThrownBy(() -> paymentService.confirmPayment(
                writerId, new ConfirmPaymentRequest("pk_1", "SZ-ABC", 9_900)))
                .isInstanceOf(PaymentException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.PAYMENT_FAILED);

        verify(tokenWalletService, never()).chargePurchase(any(), anyInt(), anyString(), any());
    }

    // ===== getByOrderId =====

    @Test
    @DisplayName("getByOrderId: 본인 주문은 조회된다")
    void getByOrderId_ownerReads() {
        Payment p = Payment.builder()
                .writer(writer).orderId("SZ-ABC").amount(2_900).tokenQty(5_000).build();
        given(paymentRepository.findByOrderId("SZ-ABC")).willReturn(Optional.of(p));

        PaymentResponse response = paymentService.getByOrderId(writerId, "SZ-ABC");

        assertThat(response.orderId()).isEqualTo("SZ-ABC");
        assertThat(response.amount()).isEqualTo(2_900);
    }

    @Test
    @DisplayName("getByOrderId: 타인 주문은 FORBIDDEN")
    void getByOrderId_foreignForbidden() {
        Payment p = Payment.builder()
                .writer(writer).orderId("SZ-ABC").amount(2_900).tokenQty(5_000).build();
        given(paymentRepository.findByOrderId("SZ-ABC")).willReturn(Optional.of(p));

        assertThatThrownBy(() -> paymentService.getByOrderId(UUID.randomUUID(), "SZ-ABC"))
                .isInstanceOf(PaymentException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FORBIDDEN);
    }
}
