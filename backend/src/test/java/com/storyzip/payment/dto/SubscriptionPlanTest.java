package com.storyzip.payment.dto;

import com.storyzip.common.exception.PaymentException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SubscriptionPlanTest {

    @Test
    @DisplayName("fromCode: PRO_MONTHLY는 990원 / 13,000 크레딧")
    void fromCode_returnsFixedPricing() {
        SubscriptionPlan plan = SubscriptionPlan.fromCode("PRO_MONTHLY");
        assertThat(plan.getAmount()).isEqualTo(990);
        assertThat(plan.getMonthlyTokens()).isEqualTo(13_000);
        assertThat(plan.getDisplayName()).contains("Pro");
    }

    @Test
    @DisplayName("fromCode: 알 수 없는 코드는 예외")
    void fromCode_unknownCode_throws() {
        assertThatThrownBy(() -> SubscriptionPlan.fromCode("UNKNOWN"))
                .isInstanceOf(PaymentException.class);
    }
}
