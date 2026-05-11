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
        assertThat(TokenPackage.fromCode("TOKEN_3000"))
                .satisfies(p -> {
                    assertThat(p.getAmount()).isEqualTo(300);
                    assertThat(p.getTokenQty()).isEqualTo(3_000);
                });
        assertThat(TokenPackage.fromCode("TOKEN_5500"))
                .satisfies(p -> {
                    assertThat(p.getAmount()).isEqualTo(500);
                    assertThat(p.getTokenQty()).isEqualTo(5_500);
                });
        assertThat(TokenPackage.fromCode("TOKEN_12000"))
                .satisfies(p -> {
                    assertThat(p.getAmount()).isEqualTo(10_000);
                    assertThat(p.getTokenQty()).isEqualTo(12_000);
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
