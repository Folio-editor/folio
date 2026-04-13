// ============================================================
// StoryZip Entity Definitions
// ============================================================
// 동기화 대상: SQLite (로컬) + PostgreSQL (서버) via PowerSync
// 서버 전용: PostgreSQL only
// ============================================================

// ────────────────────────────────────────────────────────────
// 동기화 대상 (SQLite + PostgreSQL)
// ────────────────────────────────────────────────────────────

/** 워크스페이스 (작품 단위) */
export interface Work {
  id: string;                    // UUID PK
  writer_id: string;             // FK → Writer
  title: string;                 // 작품명
  author_name: string | null;    // 작가명 (기본값: 계정 이름)
  description: string | null;    // 작품 설명/시놉시스
  status: string;                // 연재중/완결/휴재
  sort_order: number;            // 목록 정렬 순서
  created_at: string;            // ISO timestamp
  updated_at: string;
}

/** 기획 (Work와 1:1) */
export interface Plan {
  id: string;
  work_id: string;               // FK → Work (UNIQUE)
  writer_id: string;
  slogan: string | null;         // 슬로건 (작품 핵심 한 줄)
  genres: string[] | null;       // 장르 태그 배열 (PG: JSONB / SQLite: TEXT JSON)
  moods: string[] | null;        // 분위기 태그 배열 (PG: JSONB / SQLite: TEXT JSON)
  target_audience: string | null; // 타겟 독자
  content: string | null;        // TipTap JSON (자유 에디터)
  created_at: string;
  updated_at: string;
}

/** 세계관 노트 (중첩 트리 구조) */
export interface WorldNote {
  id: string;
  work_id: string;               // FK → Work
  writer_id: string;
  parent_id: string | null;      // FK → WorldNote (self), NULL = 최상위
  name: string;                  // 노트 제목
  content: string | null;        // TipTap JSON 본문
  is_template: boolean;          // 기본 템플릿 여부
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** 등장인물 카드 */
export interface Character {
  id: string;
  work_id: string;               // FK → Work
  writer_id: string;
  name: string;                  // 캐릭터 이름
  profile_image_url: string | null; // 프로필 이미지 경로
  gender: string;                // 남/여/기타/미설정
  age: string;                   // 자유 입력 ("25세", "불명")
  appearance: string;            // 외형 묘사
  mbti: string | null;           // MBTI 선택값
  personality: string | null;    // 성격 보충 설명
  content: string | null;        // TipTap JSON 자유 노트
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** 인물 커스텀 필드 */
export interface CharacterCustomField {
  id: string;
  character_id: string;          // FK → Character
  field_name: string;            // 필드명 (특기, 약점 등)
  field_value: string | null;    // 필드 값
  sort_order: number;
  created_at: string;
}

/** 인물 ↔ 세계관 태그 (다대다 중간 테이블) */
export interface CharacterTag {
  id: string;
  character_id: string;          // FK → Character
  world_note_id: string;         // FK → WorldNote
  created_at: string;
}

/** 플롯 노트 (중첩 트리 구조) */
export interface Plot {
  id: string;
  work_id: string;               // FK → Work
  writer_id: string;
  parent_id: string | null;      // FK → Plot (self), NULL = 최상위
  episode_number: number | null; // 회차 번호 (막 노드는 NULL)
  title: string;                 // 제목
  status: string | null;         // 예정/작성중/완료 (막 노드는 NULL)
  content: string | null;        // TipTap JSON 플롯 내용
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** 원고 (중첩 트리 구조) */
export interface Episode {
  id: string;
  work_id: string;               // FK → Work
  writer_id: string;
  parent_id: string | null;      // FK → Episode (self), NULL = 최상위
  episode_number: number | null; // 회차 번호 (막 노드는 NULL)
  title: string;                 // 회차 제목
  status: string;                // 미작성/초고/퇴고/완성
  content: string | null;        // TipTap JSON 원고 본문
  word_count: number;            // 자동 계산 글자수
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** 원고 버전 이력 */
export interface EpisodeVersion {
  id: string;
  episode_id: string;            // FK → Episode
  content_diff: string | null;   // 변경 내용 또는 전체 스냅샷
  word_count: number;
  saved_at: string;
}

/** 플롯 ↔ 원고 링크 (1:1 양방향) */
export interface PlotEpisodeLink {
  id: string;
  plot_id: string;               // FK → Plot (UNIQUE)
  episode_id: string;            // FK → Episode (UNIQUE)
  created_at: string;
}

/** 복선 카드 */
export interface Foreshadow {
  id: string;
  work_id: string;               // FK → Work
  writer_id: string;
  title: string;                 // 복선명
  status: string;                // 진행중/완결/폐기
  importance: string;            // 상/중/하
  content: string | null;        // TipTap JSON 메모
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** 복선 ↔ 회차 연결 (심기/회수) */
export interface ForeshadowLink {
  id: string;
  foreshadow_id: string;        // FK → Foreshadow
  link_type: string;             // plant(심기) / resolve(부분회수) / final_resolve(완결)
  episode_id: string | null;     // FK → Episode (원고 연결 시)
  plot_id: string | null;        // FK → Plot (플롯 연결 시)
  context_memo: string | null;   // 맥락 메모
  created_at: string;
}

/** 아이디어 아카이브 */
export interface IdeaArchive {
  id: string;
  work_id: string;               // FK → Work
  writer_id: string;
  title: string;                 // 핵심 내용 한 줄
  content: string | null;        // TipTap JSON 보충 설명
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** 아이디어 태그 */
export interface ArchiveTag {
  id: string;
  archive_id: string;            // FK → IdeaArchive
  tag: string;                   // 문장/장면/설정/반전/대사 + 사용자 추가
  created_at: string;
}

/** 용어 사전 */
export interface Dictionary {
  id: string;
  work_id: string;               // FK → Work
  writer_id: string;
  world_note_id: string | null;  // FK → WorldNote
  character_id: string | null;   // FK → Character
  word: string;                  // 용어
  type: string;                  // 용어 유형
  created_at: string;
  updated_at: string;
}

/** 인물 관계 (추후 구현 — 관계도 기능) */
export interface CharacterRelation {
  id: string;
  work_id: string;               // FK → Work
  writer_id: string;
  from_character_id: string;     // FK → Character
  to_character_id: string;       // FK → Character
  relation_type: string;         // 동맹/적대/연인/가족 등
  description: string | null;
  created_at: string;
  updated_at: string;
}

// ────────────────────────────────────────────────────────────
// 서버 전용 (PostgreSQL only)
// ────────────────────────────────────────────────────────────

/** 사용자 (작가) */
export interface Writer {
  id: string;
  email: string;
  password_hash: string | null;  // OAuth 전용 사용자는 NULL
  nickname: string | null;       // 작가명 기본값
  role: string;                  // user / premium / admin
  oauth_provider: string | null; // google 등
  oauth_id: string | null;
  created_at: string;
  deleted_at: string | null;     // 소프트 삭제
}

/** 리프레시 토큰 */
export interface RefreshToken {
  id: string;
  writer_id: string;
  refresh_token: string;
  expires_at: string;
  created_at: string;
}

/** 감사 로그 */
export interface AuditLog {
  id: string;
  writer_id: string | null;
  action: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

/** 결제 */
export interface Payment {
  id: string;
  writer_id: string;
  order_id: string;
  payment_key: string | null;
  amount: number;
  token_qty: number;
  status: string;
  created_at: string;
  updated_at: string;
}

/** 구독 */
export interface Subscription {
  id: string;
  writer_id: string;
  billing_key: string;
  plan: string;
  monthly_tokens: number;
  status: string;
  next_billing_at: string;
  cancelled_at: string | null;
  created_at: string;
}

/** 토큰 잔액 */
export interface TokenWallet {
  writer_id: string;             // PK, FK → Writer
  balance: number;
  total_charged: number;
  total_used: number;
  updated_at: string;
}

/** 토큰 거래 내역 */
export interface TokenTransaction {
  id: string;
  writer_id: string;
  amount: number;
  type: string;
  reason: string | null;
  reference_id: string | null;
  created_at: string;
}

/** AI 분석 */
export interface AIAnalysis {
  id: string;
  writer_id: string;
  work_id: string;
  episode_id: string;
  setting_conflicts: string | null;
  tone_conflicts: string | null;
  new_items: string | null;
  tokens_used: number;
  created_at: string;
}

/** 알림 */
export interface Notification {
  id: string;
  writer_id: string;
  type: string;                  // system / payment / subscription / usage
  title: string;                 // 알림 제목
  message: string | null;        // 알림 내용
  is_read: boolean;              // 읽음 여부
  expires_at: string | null;     // TTL 만료 시각
  created_at: string;
}

/** AI 프롬프트 템플릿 (관리자 전용) */
export interface AIPromptTemplate {
  id: string;
  name: string;                  // 템플릿 식별명 (analyze, suggest, summary 등)
  description: string | null;    // 템플릿 설명
  prompt_template: string;       // 프롬프트 본문 (변수 치환 포함)
  model: string;                 // 사용할 AI 모델 (gpt-4o, claude-sonnet 등)
  max_tokens: number;            // 최대 응답 토큰 수
  token_cost: number;            // 1회 호출 시 차감할 사용자 토큰
  is_active: boolean;            // 활성화 여부
  created_at: string;
  updated_at: string;
}

/** 내보내기 */
export interface Export {
  id: string;
  writer_id: string;
  work_id: string;
  format: string;                // DOCX/PDF/TXT
  status: string;
  file_url: string | null;
  expires_at: string | null;
  created_at: string;
}
