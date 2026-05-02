package com.storyzip.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.secretsmanager.SecretsManagerClient;
import software.amazon.awssdk.services.secretsmanager.model.GetSecretValueRequest;
import software.amazon.awssdk.services.secretsmanager.model.GetSecretValueResponse;

/**
 * Plan C 결정 6 — AWS Secrets Manager 클라이언트.
 *
 * <p>인증은 default credentials provider chain에 위임한다.
 * EC2에서는 IMDSv2 강제 인스턴스 role을 사용하며, 로컬/dev에서는
 * AWS 프로필 또는 환경변수(AWS_ACCESS_KEY_ID 등)로 대체된다.
 *
 * <p>dev 프로필은 AWS 자격증명 없이도 KEK 흐름을 검증할 수 있도록 fake
 * SecretsManagerClient를 주입한다. 고정 32B pepper(base64)를 반환하므로
 * 같은 dev 환경 내에서는 derivePepperUser 결과가 결정적이다.
 */
@Configuration
@ConditionalOnProperty(name = "folio.security.pepper.enabled", havingValue = "true")
public class AwsSecretsManagerConfig {

    @Bean(destroyMethod = "close")
    @Profile("!dev")
    public SecretsManagerClient secretsManagerClient(
            @Value("${folio.security.pepper.aws-region:ap-northeast-2}") String region) {
        return SecretsManagerClient.builder()
                .region(Region.of(region))
                .build();
    }

    /**
     * dev 전용 fake — 32B 고정 pepper를 base64로 반환한다. AWS 호출 없음.
     * 같은 dev 환경 내 모든 row가 동일 pepper로 암호화/복호화되도록 결정적.
     */
    @Bean(destroyMethod = "close")
    @Profile("dev")
    public SecretsManagerClient devFakeSecretsManagerClient() {
        return new FakeSecretsManagerClient();
    }

    static final class FakeSecretsManagerClient implements SecretsManagerClient {
        // 32B 고정값(base64) — "dev-fake-pepper-32bytes-fixed-vv". dev에서만 사용. 실제 prod pepper와 무관.
        private static final String FAKE_SECRET_JSON =
                "{\"active\":\"v1\",\"v1\":\"ZGV2LWZha2UtcGVwcGVyLTMyYnl0ZXMtZml4ZWQtdnY=\"}";

        @Override
        public GetSecretValueResponse getSecretValue(GetSecretValueRequest request) {
            return GetSecretValueResponse.builder()
                    .name(request.secretId())
                    .secretString(FAKE_SECRET_JSON)
                    .build();
        }

        @Override
        public String serviceName() {
            return "FakeSecretsManager";
        }

        @Override
        public void close() {
            // no-op
        }
    }
}
