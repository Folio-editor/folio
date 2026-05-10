package com.storyzip.payment.pricing;

import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * 토큰 사용량 → 크레딧 차감량 변환.
 *
 * <p>정책 (2026-05-08 업데이트 — 크레딧 단위 10× 세분화):
 * <ul>
 *   <li>1 크레딧 = 0.8원 (이전 8원에서 1/10 로 세분화)</li>
 *   <li>차감 = ROUND(API 원가 × 1.1 ÷ 0.8)  — 2026-05-09 마진 1.3 → 1.1 인하</li>
 *   <li>USD → KRW = 1,450</li>
 * </ul>
 *
 * <p>변경 이유: 8원 단위에서는 작은 호출(예: 0.2 크레딧 상당)이 ROUND 후 0 으로
 * 떨어져 무료 처리되던 문제 해소. 0.8원 단위로 바꾸면 같은 호출이 2 크레딧으로
 * 차감되어 사용량을 더 정밀하게 반영. 결제 패키지·구독·보너스의 토큰 수량은
 * 모두 ×10 으로 함께 조정 (실 가치 동일).
 */
@Component
public class CreditCalculator {

    public static final double USD_TO_KRW = 1_450d;
    public static final double MARGIN_RATIO = 1.1d;
    public static final double CREDIT_VALUE_KRW = 0.8d;

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
