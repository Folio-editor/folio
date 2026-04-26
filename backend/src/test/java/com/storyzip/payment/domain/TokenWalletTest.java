package com.storyzip.payment.domain;

import com.storyzip.common.exception.ErrorCode;
import com.storyzip.common.exception.PaymentException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TokenWalletTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 4, 24, 0, 0);

    @Test
    @DisplayName("createEmpty 시 3버킷 잔액과 누적은 모두 0으로 초기화된다")
    void createEmpty_initializesZero() {
        TokenWallet wallet = TokenWallet.createEmpty(UUID.randomUUID());

        assertThat(wallet.getSubscriptionBalance()).isZero();
        assertThat(wallet.getBonusBalance()).isZero();
        assertThat(wallet.getPurchaseBalance()).isZero();
        assertThat(wallet.getBonusExpiresAt()).isNull();
        assertThat(wallet.getTotalCharged()).isZero();
        assertThat(wallet.getTotalUsed()).isZero();
        assertThat(wallet.totalBalance(NOW)).isZero();
    }

    @Test
    @DisplayName("chargePurchase는 종량제 버킷을 누적 증가시킨다")
    void chargePurchase_accumulates() {
        TokenWallet wallet = TokenWallet.createEmpty(UUID.randomUUID());

        wallet.chargePurchase(5_000);
        wallet.chargePurchase(2_000);

        assertThat(wallet.getPurchaseBalance()).isEqualTo(7_000);
        assertThat(wallet.getTotalCharged()).isEqualTo(7_000);
    }

    @Test
    @DisplayName("overwriteSubscription은 잔여분을 반환하고 새 금액으로 덮어쓴다")
    void overwriteSubscription_returnsRolloverAndReplaces() {
        TokenWallet wallet = TokenWallet.createEmpty(UUID.randomUUID());
        wallet.overwriteSubscription(1_300);
        wallet.deductForUsage(300, NOW);
        assertThat(wallet.getSubscriptionBalance()).isEqualTo(1_000);

        int rolled = wallet.overwriteSubscription(1_300);

        assertThat(rolled).isEqualTo(1_000);
        assertThat(wallet.getSubscriptionBalance()).isEqualTo(1_300);
    }

    @Test
    @DisplayName("grantBonus는 버킷을 덮어쓰고 만료일을 설정한다")
    void grantBonus_setsAmountAndExpiry() {
        TokenWallet wallet = TokenWallet.createEmpty(UUID.randomUUID());
        LocalDateTime expiresAt = NOW.plusDays(90);

        wallet.grantBonus(100, expiresAt);

        assertThat(wallet.getBonusBalance()).isEqualTo(100);
        assertThat(wallet.getBonusExpiresAt()).isEqualTo(expiresAt);
        assertThat(wallet.validBonusBalance(NOW)).isEqualTo(100);
    }

    @Test
    @DisplayName("만료된 보너스는 validBonusBalance에서 0으로 취급된다")
    void expiredBonus_notCounted() {
        TokenWallet wallet = TokenWallet.createEmpty(UUID.randomUUID());
        wallet.grantBonus(100, NOW.minusDays(1));

        assertThat(wallet.validBonusBalance(NOW)).isZero();
    }

    @Test
    @DisplayName("차감 우선순위: 구독 → 보너스 → 종량제로 혼합 차감된다")
    void deductForUsage_followsPriorityWithMixing() {
        TokenWallet wallet = TokenWallet.createEmpty(UUID.randomUUID());
        wallet.overwriteSubscription(10);
        wallet.grantBonus(50, NOW.plusDays(30));
        wallet.chargePurchase(500);

        TokenWallet.DeductResult result = wallet.deductForUsage(29, NOW);

        assertThat(result.fromSubscription()).isEqualTo(10);
        assertThat(result.fromBonus()).isEqualTo(19);
        assertThat(result.fromPurchase()).isZero();
        assertThat(wallet.getSubscriptionBalance()).isZero();
        assertThat(wallet.getBonusBalance()).isEqualTo(31);
        assertThat(wallet.getPurchaseBalance()).isEqualTo(500);
        assertThat(wallet.getTotalUsed()).isEqualTo(29);
    }

    @Test
    @DisplayName("구독+보너스가 부족하면 종량제까지 이어서 차감한다")
    void deductForUsage_spillsIntoPurchase() {
        TokenWallet wallet = TokenWallet.createEmpty(UUID.randomUUID());
        wallet.overwriteSubscription(5);
        wallet.grantBonus(5, NOW.plusDays(30));
        wallet.chargePurchase(100);

        TokenWallet.DeductResult result = wallet.deductForUsage(29, NOW);

        assertThat(result.fromSubscription()).isEqualTo(5);
        assertThat(result.fromBonus()).isEqualTo(5);
        assertThat(result.fromPurchase()).isEqualTo(19);
        assertThat(wallet.getPurchaseBalance()).isEqualTo(81);
    }

    @Test
    @DisplayName("총 잔액보다 많이 차감하려 하면 INSUFFICIENT_TOKEN 예외")
    void deductForUsage_whenInsufficient_throws() {
        TokenWallet wallet = TokenWallet.createEmpty(UUID.randomUUID());
        wallet.chargePurchase(1_000);

        assertThatThrownBy(() -> wallet.deductForUsage(2_000, NOW))
                .isInstanceOf(PaymentException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INSUFFICIENT_TOKEN);
    }

    @Test
    @DisplayName("환불 차감은 종량제에서만 발생하고 잔액 부족 시 가진 만큼만 뺀다")
    void deductForRefund_takesFromPurchaseOnly() {
        TokenWallet wallet = TokenWallet.createEmpty(UUID.randomUUID());
        wallet.overwriteSubscription(500);
        wallet.chargePurchase(200);

        int actual = wallet.deductForRefund(300);

        assertThat(actual).isEqualTo(200);
        assertThat(wallet.getPurchaseBalance()).isZero();
        assertThat(wallet.getSubscriptionBalance()).isEqualTo(500);
    }

    @Test
    @DisplayName("expireSubscription은 구독 잔여를 0으로 초기화하고 소멸량을 반환")
    void expireSubscription_zeroesAndReturns() {
        TokenWallet wallet = TokenWallet.createEmpty(UUID.randomUUID());
        wallet.overwriteSubscription(1_300);

        int expired = wallet.expireSubscription();

        assertThat(expired).isEqualTo(1_300);
        assertThat(wallet.getSubscriptionBalance()).isZero();
    }

    @Test
    @DisplayName("expireBonus는 보너스 잔여와 만료일을 모두 초기화")
    void expireBonus_zeroesAndClearsExpiry() {
        TokenWallet wallet = TokenWallet.createEmpty(UUID.randomUUID());
        wallet.grantBonus(100, NOW.plusDays(30));

        int expired = wallet.expireBonus();

        assertThat(expired).isEqualTo(100);
        assertThat(wallet.getBonusBalance()).isZero();
        assertThat(wallet.getBonusExpiresAt()).isNull();
    }

    @Test
    @DisplayName("0 이하 금액 충전·차감은 INVALID_REQUEST 예외")
    void nonPositiveAmount_throws() {
        TokenWallet wallet = TokenWallet.createEmpty(UUID.randomUUID());

        assertThatThrownBy(() -> wallet.chargePurchase(0))
                .isInstanceOf(PaymentException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_REQUEST);
        assertThatThrownBy(() -> wallet.chargePurchase(-5))
                .isInstanceOf(PaymentException.class);
        assertThatThrownBy(() -> wallet.deductForUsage(0, LocalDateTime.now(ZoneOffset.UTC)))
                .isInstanceOf(PaymentException.class);
        assertThatThrownBy(() -> wallet.overwriteSubscription(-1))
                .isInstanceOf(PaymentException.class);
    }
}
