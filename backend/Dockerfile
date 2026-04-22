# ============================================================
# Folio Backend - 운영 이미지
#
# 멀티스테이지 빌드:
#   1) builder: Gradle 빌드 (의존성 캐시 레이어 분리)
#   2) runtime: JRE만 포함한 슬림 이미지
#
# 빌드:
#   docker build -t folio-backend:latest .
#
# 실행 (단독):
#   docker run --rm -p 8080:8080 \
#     -e SPRING_PROFILES_ACTIVE=prod \
#     -e DB_HOST=... -e DB_PASSWORD=... ... \
#     folio-backend:latest
# ============================================================

# ---------- Build stage ----------
FROM eclipse-temurin:21-jdk-alpine AS builder
WORKDIR /workspace

# 의존성 캐시: 먼저 wrapper/빌드 스크립트만 복사
COPY gradlew settings.gradle.kts build.gradle.kts ./
COPY gradle ./gradle
RUN chmod +x gradlew && ./gradlew --no-daemon dependencies > /dev/null 2>&1 || true

# 소스 복사 후 빌드
COPY src ./src
RUN ./gradlew --no-daemon bootJar -x test

# ---------- Runtime stage ----------
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

# 보안: 비루트 유저로 실행
RUN addgroup -S app && adduser -S app -G app

# Health check용 wget 포함 (alpine 기본 포함)
COPY --from=builder /workspace/build/libs/*.jar app.jar
RUN chown -R app:app /app
USER app

ENV JAVA_OPTS=""
ENV SPRING_PROFILES_ACTIVE="prod"
EXPOSE 8080

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -Djava.security.egd=file:/dev/./urandom -jar /app/app.jar"]
