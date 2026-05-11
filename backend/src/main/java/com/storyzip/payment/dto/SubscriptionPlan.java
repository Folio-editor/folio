package com.storyzip.payment.dto;

import com.storyzip.common.exception.ErrorCode;
import com.storyzip.common.exception.PaymentException;
import lombok.Getter;

import java.util.Arrays;

/**
 * 구독 플랜 상품. 프론트엔드 선택값을 백엔드에서 재검증하기 위한 고정 목록.
 *
 * <p>월 요금/지급 토큰량을 서버에서 결정해 클라이언트 위·변조를 방지한다.
 * 문서 {@code docs/payment-implementation.md §1} 기준.
 */
@Getter
public enum SubscriptionPlan {
    PRO_MONTHLY("PRO_MONTHLY", "Folio Pro 월간", 19_900, 25_000);

    private final String code;
    private final String displayName;
    private final int amount;
    private final int monthlyTokens;

    SubscriptionPlan(String code, String displayName, int amount, int monthlyTokens) {
        this.code = code;
        this.displayName = displayName;
        this.amount = amount;
        this.monthlyTokens = monthlyTokens;
    }

    public static SubscriptionPlan fromCode(String code) {
        return Arrays.stream(values())
                .filter(p -> p.code.equals(code))
                .findFirst()
                .orElseThrow(() -> new PaymentException(ErrorCode.INVALID_REQUEST,
                        "알 수 없는 구독 플랜 코드: " + code));
    }
}
