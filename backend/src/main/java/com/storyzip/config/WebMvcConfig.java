package com.storyzip.config;

import com.storyzip.admin.AdminAuthInterceptor;
import com.storyzip.common.ratelimit.PaymentRateLimitInterceptor;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
@RequiredArgsConstructor
public class WebMvcConfig implements WebMvcConfigurer {

    private final AdminAuthInterceptor adminAuthInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new PaymentRateLimitInterceptor())
                .addPathPatterns(
                        "/api/v1/payments/**",
                        "/api/v1/subscriptions/**"
                )
                .excludePathPatterns(
                        "/api/v1/payments/webhook/**",
                        // 관리자 API 는 별도 인증 + rate limit 무관
                        "/api/v1/admin/**"
                );

        // 관리자 API 헤더 인증 — Phase B 미완. 단일 토큰(ADMIN_API_TOKEN) 으로 알파/베타 운영.
        registry.addInterceptor(adminAuthInterceptor)
                .addPathPatterns("/api/v1/admin/**");
    }
}
