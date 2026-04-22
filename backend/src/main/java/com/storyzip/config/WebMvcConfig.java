package com.storyzip.config;

import com.storyzip.common.ratelimit.PaymentRateLimitInterceptor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new PaymentRateLimitInterceptor())
                .addPathPatterns(
                        "/api/v1/payments/**",
                        "/api/v1/subscriptions/**"
                )
                .excludePathPatterns(
                        "/api/v1/payments/webhook/**"
                );
    }
}
