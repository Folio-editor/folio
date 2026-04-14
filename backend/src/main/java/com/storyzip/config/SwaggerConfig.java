package com.storyzip.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Swagger / OpenAPI 설정.
 *
 * <p>{@code springdoc.api-docs.enabled=true} 일 때만 활성화된다.
 * 운영(prod) 프로필에서는 {@code application-prod.yml}이 false로 설정해 빈 등록을 막는다.
 *
 * <p>접속 경로:
 * <ul>
 *   <li>UI: {@code /swagger-ui.html}</li>
 *   <li>JSON: {@code /v3/api-docs}</li>
 * </ul>
 */
@Configuration
@ConditionalOnProperty(name = "springdoc.api-docs.enabled", havingValue = "true", matchIfMissing = false)
public class SwaggerConfig {

    private static final String BEARER_KEY = "BearerAuth";

    @Bean
    public OpenAPI storyZipOpenAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("StoryZip API")
                        .description("StoryZip 웹소설 작가 플랫폼 백엔드 API 문서")
                        .version("v1"))
                .addSecurityItem(new SecurityRequirement().addList(BEARER_KEY))
                .components(new Components().addSecuritySchemes(
                        BEARER_KEY,
                        new SecurityScheme()
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")
                                .in(SecurityScheme.In.HEADER)
                                .name("Authorization")));
    }
}
