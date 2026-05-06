// ============================================================
// PowerSync SQLite 스키마 — Folio
// ============================================================
// PostgreSQL sync-rules.yaml 의 동기화 대상 테이블 12개를 정의한다.
//
// 규칙:
//  - id 컬럼은 PowerSync가 자동으로 TEXT PK로 추가 → 직접 정의 하지 않음
//  - string[] 컬럼(genres, moods)은 SQLite TEXT(JSON)으로 저장
//  - NULL 허용 컬럼도 column.text / column.integer 로 선언 (SQLite는 기본 NULL 허용)
// ============================================================

import { column, Schema, Table } from '@powersync/web';

const work = new Table({
  writer_id:     column.text,
  title:         column.text,
  author_name:   column.text,
  description:   column.text,
  status:        column.text,
  sort_order:    column.integer,
  genres:        column.text,  // JSON array — 읽을 때 JSON.parse() 필요
  moods:         column.text,  // JSON array — 읽을 때 JSON.parse() 필요
  created_at:    column.text,
  updated_at:    column.text,
  // Plan C 결정 21 — wrap된 work_key (KEK으로 AES-GCM wrap한 32B DEK).
  // PostgreSQL BYTEA지만 PowerSync는 BYTEA를 직접 못 보내므로 Base64 문자열로 운반한다.
  // 서버 SyncService.applyBytea가 디코드해 진짜 BYTEA로 저장.
  encrypted_dek: column.text,
  // 작품 종류 (null = 일반, 'onboarding' = 가이드). 평문이라 WHERE 매칭 안전.
  kind: column.text,
  // Vault Transit envelope encryption (curious-wiggling-thacker plan V-4).
  // 서버에서 Vault 로 wrap 한 work_key. 클라이언트는 사용하지 않음 (단순 통과 — 다중
  // 디바이스 동기화 일관성용). NULL 가능 (오프라인 신규 작품, 온라인 복귀 시 발급).
  server_encrypted_dek: column.text,
});

// (구) plan 테이블은 ERD 정리 2단계로 폐기됨. plan_note 가 work_id 를 직접
// FK 로 가지고 있어 plan 행 자체가 불필요.
// 기획서 하위 자유 문서 (1:N). 트리/parent_id 없음.
const plan_note = new Table({
  work_id:    column.text,
  writer_id:  column.text,
  title:      column.text,
  content:    column.text,
  sort_order: column.integer,
  created_at: column.text,
  updated_at: column.text,
});

const world_note = new Table({
  work_id:    column.text,
  writer_id:  column.text,
  parent_id:  column.text,
  name:       column.text,
  content:    column.text,
  sort_order: column.integer,
  created_at: column.text,
  updated_at: column.text,
});

const character = new Table({
  work_id:           column.text,
  writer_id:         column.text,
  name:              column.text,
  profile_image_url: column.text,
  gender:            column.text,
  age:               column.text,
  sort_order:        column.integer,
  created_at:        column.text,
  updated_at:        column.text,
});

const character_note = new Table({
  character_id: column.text,
  writer_id:    column.text,
  kind:         column.text,
  title:        column.text,
  content:      column.text,
  sort_order:   column.integer,
  created_at:   column.text,
  updated_at:   column.text,
});

const character_custom_field = new Table({
  character_id: column.text,
  field_name:   column.text,
  field_value:  column.text,
  sort_order:   column.integer,
  created_at:   column.text,
  updated_at:   column.text,
});

const character_tag = new Table({
  character_id:  column.text,
  world_note_id: column.text,
  created_at:    column.text,
});

const plot = new Table({
  work_id:    column.text,
  writer_id:  column.text,
  parent_id:  column.text,
  title:      column.text,
  status:     column.text,
  content:    column.text,
  sort_order: column.integer,
  created_at: column.text,
  updated_at: column.text,
});

const episode = new Table({
  work_id:    column.text,
  writer_id:  column.text,
  parent_id:  column.text,
  title:      column.text,
  status:     column.text,
  content:    column.text,
  word_count: column.integer,
  sort_order: column.integer,
  created_at: column.text,
  updated_at: column.text,
});

const plot_episode_link = new Table({
  plot_id:    column.text,
  episode_id: column.text,
  created_at: column.text,
});

const foreshadow = new Table({
  work_id:    column.text,
  writer_id:  column.text,
  title:      column.text,
  status:     column.text,
  importance: column.text,
  content:    column.text,
  sort_order: column.integer,
  created_at: column.text,
  updated_at: column.text,
});

const foreshadow_link = new Table({
  foreshadow_id: column.text,
  link_type:     column.text,
  episode_id:    column.text,
  plot_id:       column.text,
  context_memo:  column.text,
  created_at:    column.text,
});

const idea_archive = new Table({
  work_id:    column.text,
  writer_id:  column.text,
  content:    column.text,
  tag:        column.text,
  sort_order: column.integer,
  created_at: column.text,
  updated_at: column.text,
});

export const AppSchema = new Schema({
  work,
  plan_note,
  world_note,
  character,
  character_note,
  character_custom_field,
  character_tag,
  plot,
  episode,
  plot_episode_link,
  foreshadow,
  foreshadow_link,
  idea_archive,
});

export type Database = (typeof AppSchema)['types'];
