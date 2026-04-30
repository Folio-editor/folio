package com.storyzip.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.secretsmanager.SecretsManagerClient;

/**
 * Plan C 결정 6 — AWS Secrets Manager 클라이언트.
 *
 * <p>인증은 default credentials provider chain에 위임한다.
 * EC2에서는 IMDSv2 강제 인스턴스 role을 사용하며, 로컬/dev에서는
 * AWS 프로필 또는 환경변수(AWS_ACCESS_KEY_ID 등)로 대체된다.
 */
@Configuration
@ConditionalOnProperty(name = "folio.security.pepper.enabled", havingValue = "true")
public class AwsSecretsManagerConfig {

    @Bean(destroyMethod = "close")
    public SecretsManagerClient secretsManagerClient(
            @Value("${folio.security.pepper.aws-region:ap-northeast-2}") String region) {
        return SecretsManagerClient.builder()
                .region(Region.of(region))
                .build();
    }
}
