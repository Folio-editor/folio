package com.storyzip.payment.dto;

import com.storyzip.common.exception.ErrorCode;
import com.storyzip.common.exception.PaymentException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TokenPackageTest {

    @Test
    @DisplayName("패키지 코드로 상품을 조회하면 서버가 정한 금액/수량이 반환된다")
    void fromCode_returnsFixedAmountAndQty() {
        assertThat(TokenPackage.fromCode("TOKEN_5000"))
                .satisfies(p -> {
                    assertThat(p.getAmount()).isEqualTo(2_900);
                    assertThat(p.getTokenQty()).isEqualTo(5_000);
                });
        assertThat(TokenPackage.fromCode("TOKEN_20000"))
                .satisfies(p -> {
                    assertThat(p.getAmount()).isEqualTo(9_900);
                    assertThat(p.getTokenQty()).isEqualTo(20_000);
                });
        assertThat(TokenPackage.fromCode("TOKEN_50000"))
                .satisfies(p -> {
                    assertThat(p.getAmount()).isEqualTo(19_900);
                    assertThat(p.getTokenQty()).isEqualTo(50_000);
                });
    }

    @Test
    @DisplayName("알 수 없는 패키지 코드는 INVALID_REQUEST 예외")
    void fromCode_unknownThrows() {
        assertThatThrownBy(() -> TokenPackage.fromCode("TOKEN_999"))
                .isInstanceOf(PaymentException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_REQUEST);
    }
}
