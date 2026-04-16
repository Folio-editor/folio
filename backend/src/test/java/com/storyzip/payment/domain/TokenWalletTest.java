package com.storyzip.payment.domain;

import com.storyzip.common.exception.ErrorCode;
import com.storyzip.common.exception.PaymentException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TokenWalletTest {

    @Test
    @DisplayName("createEmpty 시 잔액/누적은 모두 0으로 초기화된다")
    void createEmpty_initializesZero() {
        TokenWallet wallet = TokenWallet.createEmpty(UUID.randomUUID());

        assertThat(wallet.getBalance()).isZero();
        assertThat(wallet.getTotalCharged()).isZero();
        assertThat(wallet.getTotalUsed()).isZero();
    }

    @Test
    @DisplayName("charge는 잔액과 누적 충전량을 증가시킨다")
    void charge_increasesBalanceAndTotalCharged() {
        TokenWallet wallet = TokenWallet.createEmpty(UUID.randomUUID());

        wallet.charge(5_000);
        wallet.charge(2_000);

        assertThat(wallet.getBalance()).isEqualTo(7_000);
        assertThat(wallet.getTotalCharged()).isEqualTo(7_000);
        assertThat(wallet.getTotalUsed()).isZero();
    }

    @Test
    @DisplayName("use는 잔액을 차감하고 누적 사용량을 증가시킨다")
    void use_decreasesBalanceAndIncrementsTotalUsed() {
        TokenWallet wallet = TokenWallet.createEmpty(UUID.randomUUID());
        wallet.charge(5_000);

        wallet.use(1_500);

        assertThat(wallet.getBalance()).isEqualTo(3_500);
        assertThat(wallet.getTotalCharged()).isEqualTo(5_000);
        assertThat(wallet.getTotalUsed()).isEqualTo(1_500);
    }

    @Test
    @DisplayName("잔액보다 많이 차감하려 하면 INSUFFICIENT_TOKEN 예외")
    void use_whenInsufficient_throws() {
        TokenWallet wallet = TokenWallet.createEmpty(UUID.randomUUID());
        wallet.charge(1_000);

        assertThatThrownBy(() -> wallet.use(2_000))
                .isInstanceOf(PaymentException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INSUFFICIENT_TOKEN);
    }

    @Test
    @DisplayName("0 이하 금액 충전·차감은 INVALID_REQUEST 예외")
    void nonPositiveAmount_throws() {
        TokenWallet wallet = TokenWallet.createEmpty(UUID.randomUUID());
        wallet.charge(100);

        assertThatThrownBy(() -> wallet.charge(0))
                .isInstanceOf(PaymentException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_REQUEST);
        assertThatThrownBy(() -> wallet.charge(-5))
                .isInstanceOf(PaymentException.class);
        assertThatThrownBy(() -> wallet.use(0))
                .isInstanceOf(PaymentException.class);
        assertThatThrownBy(() -> wallet.use(-10))
                .isInstanceOf(PaymentException.class);
    }
}
