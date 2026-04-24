package com.storyzip.account.domain;

import com.storyzip.auth.domain.Role;
import lombok.Getter;

/**
 * 요금제 티어 — 클라우드 동기화 용량 기반 BM.
 *
 * <p>오프라인 퍼스트 원칙:
 * <ul>
 *   <li>로컬 쓰기는 절대 제한하지 않는다</li>
 *   <li>서버 동기화는 절대 거부하지 않는다 (큐 블록 방지)</li>
 *   <li>용량 초과 시 경고만 표시, 동기화는 계속 동작</li>
 * </ul>
 *
 * <p>Role ↔ PlanTier 매핑:
 * <ul>
 *   <li>게스트(비로그인) → FREE</li>
 *   <li>USER → STARTER</li>
 *   <li>PREMIUM / ADMIN → PRO</li>
 * </ul>
 *
 * <p>AI 토큰 재화 체계는 미확정이므로 {@code monthlyTokens}는 0으로 유지.
 */
@Getter
public enum PlanTier {

    FREE("FREE", "무료 (게스트)", 0L, 0),
    STARTER("STARTER", "Starter", 100L * 1024 * 1024, 0),  // 100MB
    PRO("PRO", "Pro", 1024L * 1024 * 1024, 0);             // 1GB

    private final String code;
    private final String displayName;
    /** 클라우드 동기화 용량 상한 (bytes). 0 = 클라우드 사용 불가. */
    private final long storageLimitBytes;
    /** 월간 AI 토큰 — 미확정, 향후 재화 기획 시 설정. */
    private final int monthlyTokens;

    PlanTier(String code, String displayName, long storageLimitBytes, int monthlyTokens) {
        this.code = code;
        this.displayName = displayName;
        this.storageLimitBytes = storageLimitBytes;
        this.monthlyTokens = monthlyTokens;
    }

    /**
     * Role에 따른 PlanTier 결정.
     */
    public static PlanTier fromRole(Role role) {
        return switch (role) {
            case PREMIUM, ADMIN -> PRO;
            case USER -> STARTER;
        };
    }
}
