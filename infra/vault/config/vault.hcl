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
}

api_addr     = "http://vault:8200"
cluster_addr = "http://vault:8201"
