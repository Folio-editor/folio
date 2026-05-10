/**
 * Folio 모달/플로팅 공용 디자인 토큰.
 * OnboardingGuideDialog, DeleteConfirmDialog, EditorShortcutHelp, FloatingHelpCard
 * 네 표면이 같은 활자·종이·호흡을 공유하도록 한 곳에서 관리한다.
 *
 * 색 토큰은 tokens.css 의 CSS 변수에 기대므로 라이트/다크 자동 전환된다.
 * Tailwind 유틸리티(`bg-popover` 등)와 inline style(`color: COLOR_INK`)
 * 둘 다에서 동일한 결과가 나오도록 var(...) 형태로 노출한다.
 */

// ── Colors (theme-aware via CSS vars) ───────────────────
export const COLOR_INK = 'var(--popover-foreground)';
export const COLOR_INK_MID = 'var(--muted-foreground)';
export const COLOR_INK_FAINT = 'color-mix(in oklab, var(--muted-foreground) 55%, transparent)';
export const COLOR_INK_BORDER = 'var(--border)';
export const COLOR_INK_RULE = 'color-mix(in oklab, var(--border) 70%, transparent)';
export const COLOR_PAPER = 'var(--popover)';
export const COLOR_PAPER_INSET = 'var(--card)';
export const COLOR_ACCENT = 'var(--destructive)';
/** 배경 dim — 항상 어두운 톤의 오버레이 (라이트/다크 공통) */
export const COLOR_BACKDROP = 'color-mix(in srgb, black 22%, transparent)';

// ── Typography ──────────────────────────────────────────
export const FONT_SERIF =
  "'Noto Serif KR', 'Nanum Myeongjo', Georgia, serif";
export const FONT_MONO =
  'ui-monospace, SFMono-Regular, Menlo, monospace';

// ── Effects ─────────────────────────────────────────────
export const MODAL_SHADOW =
  '0 1px 0 rgba(0,0,0,0.04), 0 24px 48px -28px rgba(0,0,0,0.35)';
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

/** 도움말 카드의 헬프 버튼(?)으로 축소되며 사라지는 "Genie" 효과 지속시간(ms). */
export const ORIGIN_ENTER_MS = 280;
export const ORIGIN_EXIT_MS = 240;
