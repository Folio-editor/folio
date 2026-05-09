plugins {
    java
    id("org.springframework.boot") version "3.4.0"
    id("io.spring.dependency-management") version "1.1.6"
}

group = "com.storyzip"
version = "0.0.1-SNAPSHOT"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

repositories {
    mavenCentral()
}

dependencies {
    // Web
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-validation")

    // JPA + PostgreSQL
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    runtimeOnly("org.postgresql:postgresql")

    // Redis
    implementation("org.springframework.boot:spring-boot-starter-data-redis")

    // Security + OAuth2 + JWT
    implementation("org.springframework.boot:spring-boot-starter-security")
    implementation("org.springframework.boot:spring-boot-starter-oauth2-client")
    implementation("io.jsonwebtoken:jjwt-api:0.12.6")
    runtimeOnly("io.jsonwebtoken:jjwt-impl:0.12.6")
    runtimeOnly("io.jsonwebtoken:jjwt-jackson:0.12.6")

    // Google API Client (id_token 검증)
    implementation("com.google.api-client:google-api-client:2.7.0")
    implementation("com.google.http-client:google-http-client-jackson2:1.45.0")

    // Actuator + Prometheus 메트릭 (Micrometer)
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation("io.micrometer:micrometer-registry-prometheus")

    // 구조화 JSON 로깅 (Promtail/Loki 수집용) — prod 프로필에서만 JSON 포맷 활성화
    implementation("net.logstash.logback:logstash-logback-encoder:8.0")

    // Swagger / OpenAPI
    implementation("org.springdoc:springdoc-openapi-starter-webmvc-ui:2.7.0")

    // .env 파일 자동 로딩 (Spring Boot가 시작 시 backend/.env 를 환경변수로 주입)
    implementation("me.paulschwarz:spring-dotenv:4.0.0")

    // Caffeine — WorkKeyService TTL 캐시 (Vault 호출 최소화)
    implementation("com.github.ben-manes.caffeine:caffeine:3.1.8")

    // CommonMark — agent propose_* content 의 Markdown → TipTap JSON 변환
    // (SuggestionApplier 가 평문/마크다운을 받아 위지윅 호환 doc 으로 래핑)
    implementation("org.commonmark:commonmark:0.24.0")
    // GFM strikethrough (~~ 텍스트 ~~) — TipTap strike mark 매핑
    implementation("org.commonmark:commonmark-ext-gfm-strikethrough:0.24.0")

    // Lombok
    compileOnly("org.projectlombok:lombok")
    annotationProcessor("org.projectlombok:lombok")

    // Dev
    developmentOnly("org.springframework.boot:spring-boot-devtools")

    // Test
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.springframework.security:spring-security-test")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.withType<Test> {
    useJUnitPlatform()
}
