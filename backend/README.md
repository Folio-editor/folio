# Folio Backend (Spring Boot)

## 기술 스택

| 항목 | 버전 |
|------|------|
| Java | 21 |
| Spring Boot | 3.4 |
| Spring Security | OAuth2 Client |
| Spring Data JPA | PostgreSQL |
| Spring Data Redis | Redis |
| Gradle | Kotlin DSL |

## 역할

Spring Boot는 **데이터 CRUD API를 만들지 않는다.** 데이터 동기화는 PowerSync가 자동 처리.

| 기능 | 설명 |
|------|------|
| 인증 | Google OAuth 2.0, JWT 발급/검증/갱신 |
| 결제/구독 | Toss Payments 연동, 토큰 지갑 관리 |
| 파일 관리 | 이미지 업로드 (S3), 내보내기 파일 생성 |
| 알림 | 시스템/결제/구독/사용량 알림 |
| AI 중계 | FastAPI AI 서버로 요청 전달, 토큰 차감 |
| 감사 로그 | 사용자 행동 기록 |

## 권장 패키지 구조

```
src/main/java/com/storyzip/
├── StoryZipApplication.java
├── config/           # SecurityConfig, CorsConfig, RedisConfig
├── auth/             # OAuth, JWT, Writer 엔티티
├── payment/          # Toss 결제, 구독, 토큰 지갑
├── ai/               # FastAPI 중계, AI 분석 저장
├── notification/     # 알림 생성/조회
├── export/           # 내보내기 처리
└── common/           # 공통 예외 처리, 유틸
```

## 개발 환경 접속 정보

| 서비스 | 호스트 | 포트 | 계정 |
|--------|--------|------|------|
| PostgreSQL | localhost | 5432 | storyzip / storyzip_dev |
| Redis | localhost | 6379 | - |

## 실행

```bash
# 사전 요구: Docker 인프라 기동
docker compose -f infra/dev/docker-compose.dev.yml up -d

# Spring Boot 실행
./gradlew bootRun --args='--spring.profiles.active=dev'
```

## application-dev.yml 예시

```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/storyzip
    username: storyzip
    password: storyzip_dev
    driver-class-name: org.postgresql.Driver
  jpa:
    hibernate:
      ddl-auto: validate
    show-sql: true
  data:
    redis:
      host: localhost
      port: 6379

server:
  port: 8080
```
