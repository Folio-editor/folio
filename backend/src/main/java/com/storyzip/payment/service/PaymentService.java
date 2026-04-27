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
import com.storyzip.payment.dto.ConfirmPaymentRequest;
import com.storyzip.payment.dto.CreatePaymentRequest;
import com.storyzip.payment.dto.CreatePaymentResponse;
import com.storyzip.payment.dto.PaymentResponse;
import com.storyzip.payment.dto.TokenPackage;
import com.storyzip.payment.repository.PaymentRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

/**
 * 결제 요청 생성과 승인 처리.
 *
 * <p>흐름:
 * <ol>
 *   <li>{@link #createPayment} — 주문 레코드를 READY 상태로 저장하고 orderId 반환</li>
 *   <li>프론트가 토스 결제창에서 결제 인증 완료</li>
 *   <li>{@link #confirmPayment} — 토스 승인 API 호출 → DONE 전환 + 토큰 충전</li>
 * </ol>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PaymentService {

    private final PaymentRepository paymentRepository;
    private final WriterRepository writerRepository;
    private final TossPaymentsClient tossPaymentsClient;
    private final TokenWalletService tokenWalletService;
    private final TossPaymentsProperties tossProperties;

    @Transactional
    public CreatePaymentResponse createPayment(UUID writerId, CreatePaymentRequest request) {
        Writer writer = writerRepository.findById(writerId)
                .orElseThrow(() -> new PaymentException(ErrorCode.WRITER_NOT_FOUND));

        TokenPackage pkg = TokenPackage.fromCode(request.packageCode());
        String orderId = generateOrderId();

        Payment payment = paymentRepository.save(Payment.builder()
                .writer(writer)
                .orderId(orderId)
                .amount(pkg.getAmount())
                .tokenQty(pkg.getTokenQty())
                .build());

        log.info("Payment created: writerId={}, orderId={}, amount={}",
                writerId, payment.getOrderId(), payment.getAmount());

        return new CreatePaymentResponse(
                payment.getOrderId(),
                "Folio 토큰 " + pkg.getTokenQty(),
                payment.getAmount(),
                payment.getTokenQty(),
                tossProperties.clientKey()
        );
    }

    @Transactional
    public PaymentResponse confirmPayment(UUID writerId, ConfirmPaymentRequest request) {
        // 멱등성: 동일 paymentKey로 이미 완료된 결제가 있으면 그 결과를 반환
        Optional<Payment> alreadyConfirmed = paymentRepository.findByPaymentKey(request.paymentKey());
        if (alreadyConfirmed.isPresent() && alreadyConfirmed.get().isDone()) {
            log.info("Idempotent confirm hit: paymentKey={}", request.paymentKey());
            return PaymentResponse.from(alreadyConfirmed.get());
        }

        Payment payment = paymentRepository.findByOrderId(request.orderId())
                .orElseThrow(() -> new PaymentException(ErrorCode.PAYMENT_NOT_FOUND));

        if (!payment.getWriter().getId().equals(writerId)) {
            throw new PaymentException(ErrorCode.FORBIDDEN);
        }
        if (payment.isDone()) {
            return PaymentResponse.from(payment);
        }
        if (!payment.getAmount().equals(request.amount())) {
            throw new PaymentException(ErrorCode.PAYMENT_AMOUNT_MISMATCH);
        }

        payment.markInProgress();

        TossConfirmResponse confirmed = tossPaymentsClient.confirmPayment(
                request.paymentKey(), request.orderId(), request.amount());

        PaymentMethod method = parseMethod(confirmed.method());
        payment.markDone(
                confirmed.paymentKey(),
                method,
                confirmed.approvedAt() != null
                        ? confirmed.approvedAt().atZoneSameInstant(ZoneOffset.UTC).toLocalDateTime()
                        : null
        );

        tokenWalletService.chargePurchase(
                writerId,
                payment.getTokenQty(),
                "PAYMENT_" + payment.getOrderId(),
                payment.getId()
        );

        log.info("Payment confirmed: orderId={}, paymentKey={}", payment.getOrderId(), payment.getPaymentKey());
        return PaymentResponse.from(payment);
    }

    @Transactional(readOnly = true)
    public PaymentResponse getByOrderId(UUID writerId, String orderId) {
        Payment payment = paymentRepository.findByOrderId(orderId)
                .orElseThrow(() -> new PaymentException(ErrorCode.PAYMENT_NOT_FOUND));
        if (!payment.getWriter().getId().equals(writerId)) {
            throw new PaymentException(ErrorCode.FORBIDDEN);
        }
        return PaymentResponse.from(payment);
    }

    private String generateOrderId() {
        return "SZ-" + UUID.randomUUID().toString().replace("-", "").substring(0, 20);
    }

    private PaymentMethod parseMethod(String raw) {
        if (raw == null) return null;
        return switch (raw) {
            case "카드" -> PaymentMethod.CARD;
            case "가상계좌" -> PaymentMethod.VIRTUAL_ACCOUNT;
            case "간편결제" -> PaymentMethod.EASY_PAY;
            case "계좌이체" -> PaymentMethod.TRANSFER;
            case "휴대폰" -> PaymentMethod.MOBILE_PHONE;
            case "문화상품권" -> PaymentMethod.CULTURE_GIFT_CERTIFICATE;
            default -> null;
        };
    }
}
