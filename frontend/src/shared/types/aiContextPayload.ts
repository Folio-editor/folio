/**
 * AI 컨텍스트 페이로드 타입 (PR5 — Plan C 옵션 1).
 *
 * 클라이언트가 KEK + work_key로 복호화한 평문 컨텍스트를 AI 서버로 전달하기 위한 스키마.
 * AI 서버 Pydantic `AiContextPayload` / Spring `AiContextPayload` 와 1:1 호환.
 *
 * vector_search 청크와 timeline은 옵션 1 보안 모델의 평문 예외 영역이라
 * 페이로드에 포함하지 않고 AI 서버가 DB에서 직접 읽는다.
 */

export interface AiWorkMetaPayload {
  title: string | null;
  author_name: string | null;
  description: string | null;
  status: string | null;
}

export interface AiCharacterNotePayload {
  kind: string | null;
  title: string | null;
  content: string | null;
}

export interface AiCharacterCustomFieldPayload {
  field_name: string | null;
  field_value: string | null;
}

export interface AiCharacterPayload {
  id: string;
  name: string | null;
  gender: string | null;
  age: string | null;
  notes: AiCharacterNotePayload[];
  custom_fields: AiCharacterCustomFieldPayload[];
}

export interface AiWorldNotePayload {
  name: string | null;
  content: string | null;
}

export interface AiForeshadowPayload {
  title: string | null;
  status: string | null;
  importance: string | null;
  content: string | null;
}

export interface AiPlotPayload {
  title: string | null;
  content: string | null;
}

export interface AiRecentEpisodePayload {
  sort_order: number;
  title: string | null;
  content: string | null;
}

export interface AiContextPayload {
  work_meta: AiWorkMetaPayload;
  characters: AiCharacterPayload[];
  world_notes: AiWorldNotePayload[];
  foreshadows: AiForeshadowPayload[];
  plots: AiPlotPayload[];
  recent_episodes: AiRecentEpisodePayload[];
}
