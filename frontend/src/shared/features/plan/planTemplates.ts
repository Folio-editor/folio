// ============================================================
// planTemplates — 기획 문서 신규 생성 시 미리 채울 템플릿 정의
// ============================================================
// Option B 채택: 템플릿 식별자(template_kind)는 DB에 저장하지 않는다.
// 선택한 템플릿의 content만 INSERT 시점에 한 번 미리채우고 이후엔 일반 plan_note로 취급.
// 사이드바 아이콘 영구 표기는 ERD 추가 후(차후 PR)에 가능.
// ============================================================

/** 템플릿 정의 — id/label/icon은 모달 표시용, content가 실제 INSERT 본문 */
export interface PlanTemplate {
  /** 식별자. 모달 내 key 용도. DB에 저장되지 않음 */
  id: string;
  /** 모달에 표시되는 이름 */
  label: string;
  /** 모달 카드 하단 보조 설명 */
  description: string;
  /** 모달 카드 아이콘 (이모지) */
  icon: string;
  /**
   * 신규 plan_note 생성 시 INSERT 될 본문.
   * - null: 빈 본문 (기존 동작과 동일)
   * - object: TipTap document JSON. INSERT 직전 JSON.stringify 처리
   */
  content: object | null;
}

export const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    id: 'empty',
    label: '빈 서식',
    description: '제목만 있는 빈 문서로 시작',
    icon: '📄',
    content: null,
  },
  // 차후 추가 예시:
  // {
  //   id: 'synopsis',
  //   label: '시놉시스',
  //   description: '한 줄 요약 + 줄거리 + 주요 인물 + 갈등',
  //   icon: '📋',
  //   content: {
  //     type: 'doc',
  //     content: [
  //       { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '한 줄 요약' }] },
  //       { type: 'paragraph' },
  //       { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '줄거리' }] },
  //       { type: 'paragraph' },
  //       ...
  //     ],
  //   },
  // },
];

/** 템플릿 content 를 DB INSERT용 string으로 직렬화. null이면 null 반환 */
export function serializeTemplateContent(template: PlanTemplate): string | null {
  if (template.content === null) return null;
  return JSON.stringify(template.content);
}
