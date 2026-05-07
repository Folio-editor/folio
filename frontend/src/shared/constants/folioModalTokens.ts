/**
 * Folio 모달/플로팅 공용 디자인 토큰.
 * OnboardingGuideDialog, DeleteConfirmDialog, EditorShortcutHelp, FloatingHelpCard
 * 네 표면이 같은 활자·종이·호흡을 공유하도록 한 곳에서 관리한다.
 *
 * 주의:
 *   - Tailwind v4 의 임의값 클래스에는 토큰을 직접 넣을 수 없으므로(예:
 *     `bg-[${INK_BORDER}]` 처럼 동적 보간 불가) hex 자체는 코드에 그대로 두되,
 *     여기 모듈 상수와 항상 같은 값을 유지하는 것을 원칙으로 한다.
 *   - 변경 시 4 곳을 동시에 갱신할 것. 또는 향후 styled-components/emotion 도입 시
 *     이 모듈을 단일 진실 공급원으로 쓴다.
 */

// ── Colors ───────────────────────────────────────────────
export const COLOR_INK = '#111111';
export const COLOR_INK_MID = '#6b6b6b';
export const COLOR_INK_FAINT = '#b4b4b4';
export const COLOR_INK_BORDER = '#d4d4d4';
export const COLOR_INK_RULE = '#e5e5e2';
export const COLOR_PAPER = '#fafaf7';
export const COLOR_ACCENT = '#a01818';
export const COLOR_BACKDROP = 'rgba(17,17,17,0.18)';

// ── Typography ──────────────────────────────────────────
export const FONT_SERIF =
  "'Noto Serif KR', 'Nanum Myeongjo', Georgia, serif";
export const FONT_MONO =
  'ui-monospace, SFMono-Regular, Menlo, monospace';

// ── Effects ─────────────────────────────────────────────
export const MODAL_SHADOW =
  '0 1px 0 rgba(17,17,17,0.04), 0 24px 48px -28px rgba(17,17,17,0.22)';
export const BACKDROP_BLUR = 'blur(8px)';

// ── Motion ──────────────────────────────────────────────
/** 모달 진입 — opacity + translateY(6px) → 0, 320ms */
export const KEYFRAME_RISE_NAME = 'folioDialogRise';
/** 비차단 플로팅 진입 — opacity 0 → 1, 200ms */
export const KEYFRAME_FADE_NAME = 'folioDialogFade';

/** 같은 keyframes 정의를 한 번만 주입하기 위한 글로벌 CSS.
 *  최상위 레이아웃(또는 첫 모달)에서 한 번만 렌더하면 된다.
 *  reduced-motion 대응 포함. */
export const FOLIO_MODAL_KEYFRAMES_CSS = `
  @keyframes ${KEYFRAME_RISE_NAME} {
    from { opacity: 0; transform: translateY(6px); }
  }
  @keyframes ${KEYFRAME_FADE_NAME} {
    from { opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    [data-folio-dialog] { animation: none !important; }
  }
`;

export const RISE_ANIMATION = `${KEYFRAME_RISE_NAME} 320ms cubic-bezier(0.2,0.7,0.2,1)`;
export const FADE_ANIMATION = `${KEYFRAME_FADE_NAME} 200ms ease-out`;
