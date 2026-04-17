// ============================================================
// PowerSync SQLite 스키마 — StoryZip
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
  writer_id:   column.text,
  title:       column.text,
  author_name: column.text,
  description: column.text,
  status:      column.text,
  sort_order:  column.integer,
  created_at:  column.text,
  updated_at:  column.text,
});

const plan = new Table({
  work_id:         column.text,
  writer_id:       column.text,
  slogan:          column.text,
  genres:          column.text,  // JSON array — 읽을 때 JSON.parse() 필요
  moods:           column.text,  // JSON array — 읽을 때 JSON.parse() 필요
  target_audience: column.text,
  content:         column.text,
  created_at:      column.text,
  updated_at:      column.text,
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
  appearance:        column.text,
  mbti:              column.text,
  personality:       column.text,
  content:           column.text,
  sort_order:        column.integer,
  created_at:        column.text,
  updated_at:        column.text,
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
  plan,
  world_note,
  character,
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
