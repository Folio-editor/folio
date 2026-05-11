package com.storyzip.payment.dto;

import com.storyzip.common.exception.ErrorCode;
import com.storyzip.common.exception.PaymentException;
import lombok.Getter;

import java.util.Arrays;

/**
 * 토큰 충전 상품. 프론트엔드 선택값을 백엔드에서 재검증하기 위한 고정 목록.
 *
 * <p>가격·수량을 서버에서 결정해 클라이언트 위·변조를 방지한다.
 */
@Getter
public enum TokenPackage {
    SMALL("TOKEN_3000", 3_000, 3_000),
    MEDIUM("TOKEN_5500", 5_000, 5_500),
    LARGE("TOKEN_12000", 10_000, 12_000);

    private final String code;
    private final int amount;
    private final int tokenQty;

    TokenPackage(String code, int amount, int tokenQty) {
        this.code = code;
        this.amount = amount;
        this.tokenQty = tokenQty;
    }

    public static TokenPackage fromCode(String code) {
        return Arrays.stream(values())
                .filter(p -> p.code.equals(code))
                .findFirst()
                .orElseThrow(() -> new PaymentException(ErrorCode.INVALID_REQUEST,
                        "알 수 없는 토큰 상품 코드: " + code));
    }
}
