package com.storyzip.payment.service;

import com.storyzip.auth.domain.Writer;
import com.storyzip.auth.repository.WriterRepository;
import com.storyzip.common.exception.ErrorCode;
import com.storyzip.common.exception.PaymentException;
import com.storyzip.payment.client.PortOneClient;
import com.storyzip.payment.client.PortOnePaymentResponse;
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
import java.util.UUID;

/**
 * 결제 요청 생성과 검증 처리.
 *
 * <p>흐름 (PortOne V2):
 * <ol>
 *   <li>{@link #createPayment} — 주문 레코드를 READY 상태로 저장하고 paymentId 반환</li>
 *   <li>프론트가 PortOne SDK로 결제창 띄우고 결제 인증 완료</li>
 *   <li>{@link #confirmPayment} — paymentId로 PortOne 결제 조회 → 금액/상태 검증 → DONE 전환 + 토큰 충전</li>
 * </ol>
 *
 * <p>PortOne은 토스와 달리 "승인" 단계가 별도로 없고, SDK가 PG와 직접 통신해 결제를 완료한다.
 * 서버는 paymentId 단건조회로 위변조만 검증한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PaymentService {

    private final PaymentRepository paymentRepository;
    private final WriterRepository writerRepository;
    private final PortOneClient portOneClient;
    private final TokenWalletService tokenWalletService;

    @Transactional
    public CreatePaymentResponse createPayment(UUID writerId, CreatePaymentRequest request) {
        Writer writer = writerRepository.findById(writerId)
                .orElseThrow(() -> new PaymentException(ErrorCode.WRITER_NOT_FOUND));

        TokenPackage pkg = TokenPackage.fromCode(request.packageCode());
        String paymentId = generatePaymentId();

        Payment payment = paymentRepository.save(Payment.builder()
                .writer(writer)
                .orderId(paymentId)
                .amount(pkg.getAmount())
                .tokenQty(pkg.getTokenQty())
                .build());

        log.info("[PAYMENT_CREATED] writerId={} paymentId={} amount={} tokenQty={} package={}",
                writerId, payment.getOrderId(), payment.getAmount(), payment.getTokenQty(), pkg.name());

        return new CreatePaymentResponse(
                payment.getOrderId(),
                "Folio 토큰 " + pkg.getTokenQty() + "개 충전",
                payment.getAmount(),
                payment.getTokenQty()
        );
    }

    @Transactional
    public PaymentResponse confirmPayment(UUID writerId, ConfirmPaymentRequest request) {
        Payment payment = paymentRepository.findByOrderId(request.paymentId())
                .orElseThrow(() -> new PaymentException(ErrorCode.PAYMENT_NOT_FOUND));

        if (!payment.getWriter().getId().equals(writerId)) {
            throw new PaymentException(ErrorCode.FORBIDDEN);
        }
        if (payment.isDone()) {
            // 멱등 — 이미 검증 완료된 결제
            return PaymentResponse.from(payment);
        }

        payment.markInProgress();

        PortOnePaymentResponse remote = portOneClient.getPayment(request.paymentId());

        // 금액 위변조 검증 — SDK가 사용자 측에서 호출하므로 totalAmount가 조작될 수 있음
        Integer remoteTotal = remote.amount() != null ? remote.amount().total() : null;
        if (remoteTotal == null || !payment.getAmount().equals(remoteTotal)) {
            throw new PaymentException(ErrorCode.PAYMENT_AMOUNT_MISMATCH);
        }

        if (!"PAID".equals(remote.status())) {
            // 가상계좌 발급 등은 PAID가 아닌 상태로 도착할 수 있으나, 카카오페이만 사용하는 현 상황에서는
            // 즉시 PAID여야 한다. PAID가 아니면 검증 실패로 처리.
            throw new PaymentException(ErrorCode.PAYMENT_FAILED,
                    "결제가 완료되지 않았습니다. status=" + remote.status());
        }

        PaymentMethod method = parseMethod(remote.method());
        payment.markDone(
                remote.id(),
                method,
                remote.paidAt() != null
                        ? remote.paidAt().atZoneSameInstant(ZoneOffset.UTC).toLocalDateTime()
                        : null
        );

        tokenWalletService.chargePurchase(
                writerId,
                payment.getTokenQty(),
                "PAYMENT_" + payment.getOrderId(),
                payment.getId()
        );

        log.info("[PAYMENT_CONFIRMED] writerId={} paymentId={} amount={} tokenQty={} method={}",
                writerId, payment.getOrderId(), payment.getAmount(),
                payment.getTokenQty(), method);
        return PaymentResponse.from(payment);
    }

    @Transactional(readOnly = true)
    public PaymentResponse getByOrderId(UUID writerId, String paymentId) {
        Payment payment = paymentRepository.findByOrderId(paymentId)
                .orElseThrow(() -> new PaymentException(ErrorCode.PAYMENT_NOT_FOUND));
        if (!payment.getWriter().getId().equals(writerId)) {
            throw new PaymentException(ErrorCode.FORBIDDEN);
        }
        return PaymentResponse.from(payment);
    }

    private String generatePaymentId() {
        return "SZ-" + UUID.randomUUID().toString().replace("-", "").substring(0, 20);
    }

    /**
     * 포트원 결제 수단 → 내부 enum 매핑.
     * 카카오페이는 type={@code PaymentMethodEasyPay}, provider={@code KAKAOPAY}로 내려온다.
     */
    private PaymentMethod parseMethod(PortOnePaymentResponse.Method method) {
        if (method == null || method.type() == null) return null;
        return switch (method.type()) {
            case "PaymentMethodCard" -> PaymentMethod.CARD;
            case "PaymentMethodVirtualAccount" -> PaymentMethod.VIRTUAL_ACCOUNT;
            case "PaymentMethodEasyPay" -> PaymentMethod.EASY_PAY;
            case "PaymentMethodTransfer" -> PaymentMethod.TRANSFER;
            case "PaymentMethodMobile" -> PaymentMethod.MOBILE_PHONE;
            case "PaymentMethodGiftCertificate" -> PaymentMethod.CULTURE_GIFT_CERTIFICATE;
            default -> null;
        };
    }
}
