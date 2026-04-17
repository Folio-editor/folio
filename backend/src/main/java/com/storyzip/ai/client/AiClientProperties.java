package com.storyzip.ai.client;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/** FastAPI AI 서버 연결 설정 (application.yml의 ai.client.* 매핑). */
@Getter
@Setter
@ConfigurationProperties(prefix = "ai.client")
public class AiClientProperties {

    private String baseUrl;
    private String internalApiKey;
    private Duration connectTimeout = Duration.ofSeconds(3);
    private Duration readTimeout = Duration.ofSeconds(10);
}
