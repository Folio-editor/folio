package com.storyzip.payment.pricing;

import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * 토큰 사용량 → 크레딧 차감량 변환.
 *
 * <p>정책 (docs/credit-policy.md 2026-04-24):
 * <ul>
 *   <li>1 크레딧 = 8원 (고정)</li>
 *   <li>차감 = ROUND(API 원가 × 1.3 ÷ 8)</li>
 *   <li>USD → KRW = 1,450</li>
 * </ul>
 */
@Component
public class CreditCalculator {

    public static final double USD_TO_KRW = 1_450d;
    public static final double MARGIN_RATIO = 1.3d;
    public static final double CREDIT_VALUE_KRW = 8d;

    /** 모델별 1M 토큰당 USD 단가. */
    private static final Map<String, Pricing> PRICING_USD_PER_1M = Map.of(
            "haiku",  new Pricing(1d,  5d),
            "sonnet", new Pricing(3d, 15d),
            "opus",   new Pricing(5d, 25d)
    );

    /** 알 수 없는 모델 → sonnet 단가로 폴백 (안전한 상한). */
    private static final Pricing FALLBACK = PRICING_USD_PER_1M.get("sonnet");

    private record Pricing(double inputUsdPer1M, double outputUsdPer1M) {}

    public int calcCredits(String model, int inputTokens, int outputTokens) {
        double cost = apiCostKrw(model, inputTokens, outputTokens);
        double charged = cost * MARGIN_RATIO;
        return (int) Math.round(charged / CREDIT_VALUE_KRW);
    }

    public double apiCostKrw(String model, int inputTokens, int outputTokens) {
        Pricing p = PRICING_USD_PER_1M.getOrDefault(normalize(model), FALLBACK);
        double inputCost  = inputTokens  * p.inputUsdPer1M  / 1_000_000d * USD_TO_KRW;
        double outputCost = outputTokens * p.outputUsdPer1M / 1_000_000d * USD_TO_KRW;
        return inputCost + outputCost;
    }

    private String normalize(String model) {
        if (model == null) return "sonnet";
        return model.trim().toLowerCase();
    }
}
