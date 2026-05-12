// HashiCorp Vault dev/prod 공통 베이스 설정.
// Plan C 옵션 1 → Vault Transit envelope encryption 전환에 사용 (curious-wiggling-thacker plan V-1).
// 컨테이너 내부 docker network 전용 — 외부 노출 금지 (교육기관 EC2 방화벽 무관하게 작동).

ui = true
disable_mlock = false

storage "file" {
  path = "/vault/data"
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  // dev 환경: TLS off (compose 내부 통신). prod 전환 시 TLS 재활성 필요.
  tls_disable = true
  // B-5 (MONITORING_AUDIT): Prometheus 가 토큰 없이 /v1/sys/metrics scrape 가능.
  // folio-net 내부 통신만 가능하므로 외부 노출 위험 없음.
  telemetry {
    unauthenticated_metrics_access = true
  }
}

// B-5: 메트릭 보존 + 호스트명 라벨 비활성 (cardinality 절약).
telemetry {
  prometheus_retention_time = "30s"
  disable_hostname          = true
}

api_addr     = "http://vault:8200"
cluster_addr = "http://vault:8201"
