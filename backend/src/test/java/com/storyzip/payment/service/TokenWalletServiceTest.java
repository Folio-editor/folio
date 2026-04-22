package com.storyzip.payment.service;

import com.storyzip.common.exception.ErrorCode;
import com.storyzip.common.exception.PaymentException;
import com.storyzip.payment.domain.TokenTransaction;
import com.storyzip.payment.domain.TokenTransactionType;
import com.storyzip.payment.domain.TokenWallet;
import com.storyzip.payment.dto.TokenWalletResponse;
import com.storyzip.payment.repository.TokenTransactionRepository;
import com.storyzip.payment.repository.TokenWalletRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class TokenWalletServiceTest {

    @Mock
    TokenWalletRepository walletRepository;
    @Mock
    TokenTransactionRepository transactionRepository;

    @InjectMocks
    TokenWalletService tokenWalletService;

    UUID writerId;

    @BeforeEach
    void setUp() {
        writerId = UUID.randomUUID();
    }

    @Test
    @DisplayName("getWallet: 지갑이 없으면 빈 지갑을 생성해 반환한다")
    void getWallet_createsEmptyIfMissing() {
        given(walletRepository.findById(writerId)).willReturn(Optional.empty());
        given(walletRepository.save(any(TokenWallet.class))).willAnswer(inv -> inv.getArgument(0));

        TokenWalletResponse response = tokenWalletService.getWallet(writerId);

        assertThat(response.balance()).isZero();
        assertThat(response.totalCharged()).isZero();
        assertThat(response.totalUsed()).isZero();
    }

    @Test
    @DisplayName("charge: 잔액을 증가시키고 원장에 CHARGE 레코드 + expiresAt을 기록한다")
    void charge_updatesWalletAndLogsTransaction() {
        TokenWallet wallet = TokenWallet.createEmpty(writerId);
        given(walletRepository.findWithLockByWriterId(writerId)).willReturn(Optional.of(wallet));

        UUID paymentId = UUID.randomUUID();
        tokenWalletService.charge(writerId, 5_000, TokenTransactionType.CHARGE,
                "PAYMENT_SZ-ABC", paymentId);

        assertThat(wallet.getBalance()).isEqualTo(5_000);
        assertThat(wallet.getTotalCharged()).isEqualTo(5_000);

        ArgumentCaptor<TokenTransaction> captor = ArgumentCaptor.forClass(TokenTransaction.class);
        verify(transactionRepository).save(captor.capture());
        TokenTransaction tx = captor.getValue();
        assertThat(tx.getAmount()).isEqualTo(5_000);
        assertThat(tx.getType()).isEqualTo(TokenTransactionType.CHARGE);
        assertThat(tx.getReason()).isEqualTo("PAYMENT_SZ-ABC");
        assertThat(tx.getReferenceId()).isEqualTo(paymentId);
        assertThat(tx.getExpiresAt()).isNotNull();
    }

    @Test
    @DisplayName("charge: 지갑이 없으면 새로 만들고 충전한다")
    void charge_createsWalletIfMissing() {
        given(walletRepository.findWithLockByWriterId(writerId)).willReturn(Optional.empty());
        given(walletRepository.save(any(TokenWallet.class))).willAnswer(inv -> inv.getArgument(0));

        tokenWalletService.charge(writerId, 5_000, TokenTransactionType.CHARGE,
                "PAYMENT_SZ-ABC", UUID.randomUUID());

        verify(walletRepository).save(any(TokenWallet.class));
        verify(transactionRepository).save(any(TokenTransaction.class));
    }

    @Test
    @DisplayName("use: 잔액을 차감하고 음수 금액 USAGE 레코드를 남긴다")
    void use_decrementsWalletAndLogsNegativeTransaction() {
        TokenWallet wallet = TokenWallet.createEmpty(writerId);
        wallet.charge(5_000);
        given(walletRepository.findWithLockByWriterId(writerId)).willReturn(Optional.of(wallet));

        tokenWalletService.use(writerId, 1_500, "AI_CONTINUATION", UUID.randomUUID());

        assertThat(wallet.getBalance()).isEqualTo(3_500);
        assertThat(wallet.getTotalUsed()).isEqualTo(1_500);

        ArgumentCaptor<TokenTransaction> captor = ArgumentCaptor.forClass(TokenTransaction.class);
        verify(transactionRepository).save(captor.capture());
        TokenTransaction tx = captor.getValue();
        assertThat(tx.getAmount()).isEqualTo(-1_500);
        assertThat(tx.getType()).isEqualTo(TokenTransactionType.USAGE);
    }

    @Test
    @DisplayName("use: 잔액 부족이면 INSUFFICIENT_TOKEN 예외 (원장 기록도 안 남음)")
    void use_whenInsufficient_throwsAndDoesNotLog() {
        TokenWallet wallet = TokenWallet.createEmpty(writerId);
        wallet.charge(500);
        given(walletRepository.findWithLockByWriterId(writerId)).willReturn(Optional.of(wallet));

        assertThatThrownBy(() -> tokenWalletService.use(writerId, 1_000, "AI", UUID.randomUUID()))
                .isInstanceOf(PaymentException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.INSUFFICIENT_TOKEN);
    }
}
