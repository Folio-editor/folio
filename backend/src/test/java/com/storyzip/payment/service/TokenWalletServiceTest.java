package com.storyzip.payment.service;

import com.storyzip.common.exception.ErrorCode;
import com.storyzip.common.exception.PaymentException;
import com.storyzip.payment.domain.TokenBucket;
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

import java.util.List;
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
        assertThat(response.purchaseBalance()).isZero();
    }

    @Test
    @DisplayName("chargePurchase: 종량제 버킷에 가산하고 PURCHASE 원장을 남긴다")
    void chargePurchase_updatesWalletAndLogsTransaction() {
        TokenWallet wallet = TokenWallet.createEmpty(writerId);
        given(walletRepository.findWithLockByWriterId(writerId)).willReturn(Optional.of(wallet));

        UUID paymentId = UUID.randomUUID();
        tokenWalletService.chargePurchase(writerId, 5_000, "PAYMENT_SZ-ABC", paymentId);

        assertThat(wallet.getPurchaseBalance()).isEqualTo(5_000);
        assertThat(wallet.getTotalCharged()).isEqualTo(5_000);

        ArgumentCaptor<TokenTransaction> captor = ArgumentCaptor.forClass(TokenTransaction.class);
        verify(transactionRepository).save(captor.capture());
        TokenTransaction tx = captor.getValue();
        assertThat(tx.getAmount()).isEqualTo(5_000);
        assertThat(tx.getBucket()).isEqualTo(TokenBucket.PURCHASE);
        assertThat(tx.getType()).isEqualTo(TokenTransactionType.CHARGE);
        assertThat(tx.getReason()).isEqualTo("PAYMENT_SZ-ABC");
        assertThat(tx.getReferenceId()).isEqualTo(paymentId);
    }

    @Test
    @DisplayName("chargeSubscription: 이전 잔여분을 EXPIRE로 기록하고 새 금액으로 덮어쓴다")
    void chargeSubscription_rollsOverPreviousBalance() {
        TokenWallet wallet = TokenWallet.createEmpty(writerId);
        wallet.overwriteSubscription(1_300);
        wallet.deductForUsage(300, java.time.LocalDateTime.now(java.time.ZoneOffset.UTC));
        given(walletRepository.findWithLockByWriterId(writerId)).willReturn(Optional.of(wallet));

        UUID paymentId = UUID.randomUUID();
        tokenWalletService.chargeSubscription(writerId, 1_300, "SUBSCRIPTION_SUB-XYZ", paymentId);

        assertThat(wallet.getSubscriptionBalance()).isEqualTo(1_300);

        ArgumentCaptor<TokenTransaction> captor = ArgumentCaptor.forClass(TokenTransaction.class);
        verify(transactionRepository, org.mockito.Mockito.times(2)).save(captor.capture());
        List<TokenTransaction> txs = captor.getAllValues();

        TokenTransaction expireTx = txs.stream()
                .filter(t -> t.getType() == TokenTransactionType.EXPIRE).findFirst().orElseThrow();
        assertThat(expireTx.getBucket()).isEqualTo(TokenBucket.SUBSCRIPTION);
        assertThat(expireTx.getAmount()).isEqualTo(-1_000);

        TokenTransaction chargeTx = txs.stream()
                .filter(t -> t.getType() == TokenTransactionType.SUBSCRIPTION).findFirst().orElseThrow();
        assertThat(chargeTx.getBucket()).isEqualTo(TokenBucket.SUBSCRIPTION);
        assertThat(chargeTx.getAmount()).isEqualTo(1_300);
    }

    @Test
    @DisplayName("grantSignupBonus: bonus 버킷에 3,000 크레딧 + 90일 만료를 설정하고 BONUS_GRANT 기록")
    void grantSignupBonus_setsBonusAndLogs() {
        TokenWallet wallet = TokenWallet.createEmpty(writerId);
        given(walletRepository.findWithLockByWriterId(writerId)).willReturn(Optional.of(wallet));

        tokenWalletService.grantSignupBonus(writerId);

        assertThat(wallet.getBonusBalance()).isEqualTo(3_000);
        assertThat(wallet.getBonusExpiresAt()).isNotNull();

        ArgumentCaptor<TokenTransaction> captor = ArgumentCaptor.forClass(TokenTransaction.class);
        verify(transactionRepository).save(captor.capture());
        TokenTransaction tx = captor.getValue();
        assertThat(tx.getBucket()).isEqualTo(TokenBucket.BONUS);
        assertThat(tx.getType()).isEqualTo(TokenTransactionType.BONUS_GRANT);
        assertThat(tx.getAmount()).isEqualTo(3_000);
    }

    @Test
    @DisplayName("use: 구독 → 보너스 → 종량제 순으로 차감하고 버킷별 원장을 분리 기록")
    void use_splitsAcrossBucketsAndLogsEach() {
        TokenWallet wallet = TokenWallet.createEmpty(writerId);
        wallet.overwriteSubscription(10);
        wallet.grantBonus(50, java.time.LocalDateTime.now(java.time.ZoneOffset.UTC).plusDays(30));
        wallet.chargePurchase(500);
        given(walletRepository.findWithLockByWriterId(writerId)).willReturn(Optional.of(wallet));

        tokenWalletService.use(writerId, 29, "REVIEW", UUID.randomUUID());

        ArgumentCaptor<TokenTransaction> captor = ArgumentCaptor.forClass(TokenTransaction.class);
        verify(transactionRepository, org.mockito.Mockito.times(2)).save(captor.capture());
        List<TokenTransaction> txs = captor.getAllValues();

        TokenTransaction subTx = txs.stream()
                .filter(t -> t.getBucket() == TokenBucket.SUBSCRIPTION).findFirst().orElseThrow();
        assertThat(subTx.getAmount()).isEqualTo(-10);
        assertThat(subTx.getType()).isEqualTo(TokenTransactionType.USAGE);

        TokenTransaction bonusTx = txs.stream()
                .filter(t -> t.getBucket() == TokenBucket.BONUS).findFirst().orElseThrow();
        assertThat(bonusTx.getAmount()).isEqualTo(-19);
        assertThat(bonusTx.getType()).isEqualTo(TokenTransactionType.USAGE);
    }

    @Test
    @DisplayName("use: 총 잔액 부족이면 INSUFFICIENT_TOKEN 예외")
    void use_whenInsufficient_throws() {
        TokenWallet wallet = TokenWallet.createEmpty(writerId);
        wallet.chargePurchase(500);
        given(walletRepository.findWithLockByWriterId(writerId)).willReturn(Optional.of(wallet));

        assertThatThrownBy(() -> tokenWalletService.use(writerId, 1_000, "AI", UUID.randomUUID()))
                .isInstanceOf(PaymentException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.INSUFFICIENT_TOKEN);
    }

    @Test
    @DisplayName("deductForRefund: 종량제에서만 차감하고 PURCHASE REFUND 기록을 남긴다")
    void deductForRefund_updatesPurchaseAndLogs() {
        TokenWallet wallet = TokenWallet.createEmpty(writerId);
        wallet.chargePurchase(1_000);
        given(walletRepository.findWithLockByWriterId(writerId)).willReturn(Optional.of(wallet));

        tokenWalletService.deductForRefund(writerId, 300, "REFUND_SZ-XYZ", UUID.randomUUID());

        assertThat(wallet.getPurchaseBalance()).isEqualTo(700);

        ArgumentCaptor<TokenTransaction> captor = ArgumentCaptor.forClass(TokenTransaction.class);
        verify(transactionRepository).save(captor.capture());
        TokenTransaction tx = captor.getValue();
        assertThat(tx.getBucket()).isEqualTo(TokenBucket.PURCHASE);
        assertThat(tx.getType()).isEqualTo(TokenTransactionType.REFUND);
        assertThat(tx.getAmount()).isEqualTo(-300);
    }

    @Test
    @DisplayName("expireSubscription: 구독 잔여를 0으로 만들고 EXPIRE 원장을 남긴다")
    void expireSubscription_zeroesAndLogs() {
        TokenWallet wallet = TokenWallet.createEmpty(writerId);
        wallet.overwriteSubscription(1_300);
        given(walletRepository.findWithLockByWriterId(writerId)).willReturn(Optional.of(wallet));

        UUID subId = UUID.randomUUID();
        tokenWalletService.expireSubscription(writerId, subId);

        assertThat(wallet.getSubscriptionBalance()).isZero();

        ArgumentCaptor<TokenTransaction> captor = ArgumentCaptor.forClass(TokenTransaction.class);
        verify(transactionRepository).save(captor.capture());
        TokenTransaction tx = captor.getValue();
        assertThat(tx.getBucket()).isEqualTo(TokenBucket.SUBSCRIPTION);
        assertThat(tx.getType()).isEqualTo(TokenTransactionType.EXPIRE);
        assertThat(tx.getAmount()).isEqualTo(-1_300);
        assertThat(tx.getReferenceId()).isEqualTo(subId);
    }

    @Test
    @DisplayName("expireBonus: 보너스 잔여를 0으로 만들고 EXPIRE 원장을 남긴다")
    void expireBonus_zeroesAndLogs() {
        TokenWallet wallet = TokenWallet.createEmpty(writerId);
        wallet.grantBonus(100, java.time.LocalDateTime.now(java.time.ZoneOffset.UTC).plusDays(30));
        given(walletRepository.findWithLockByWriterId(writerId)).willReturn(Optional.of(wallet));

        tokenWalletService.expireBonus(writerId);

        assertThat(wallet.getBonusBalance()).isZero();

        ArgumentCaptor<TokenTransaction> captor = ArgumentCaptor.forClass(TokenTransaction.class);
        verify(transactionRepository).save(captor.capture());
        TokenTransaction tx = captor.getValue();
        assertThat(tx.getBucket()).isEqualTo(TokenBucket.BONUS);
        assertThat(tx.getType()).isEqualTo(TokenTransactionType.EXPIRE);
        assertThat(tx.getAmount()).isEqualTo(-100);
    }
}
