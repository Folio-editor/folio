import { useEffect, type ReactNode } from 'react';
import {
  ONBOARDING_WORK,
  ONBOARDING_EPISODES,
  ONBOARDING_CHARACTERS,
  ONBOARDING_FORESHADOW,
  ONBOARDING_IDEAS,
} from '../../constants/onboardingContent';
import { WORLD_NOTE_TEMPLATES } from '../../constants/worldNoteTemplates';
import {
  FONT_SERIF,
  MODAL_SHADOW,
  RISE_ANIMATION,
  COLOR_BACKDROP,
  BACKDROP_BLUR,
} from '../../constants/folioModalTokens';
import { cn } from '../../lib/cn';

interface OnboardingGuideDialogProps {
  open: boolean;
  busy: boolean;
  onAccept: () => void;
  onSkip: () => void;
}

export function OnboardingGuideDialog({
  open,
  busy,
  onAccept,
  onSkip,
}: OnboardingGuideDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (busy) return;
      if (e.key === 'Escape' || e.key === '2') {
        e.preventDefault();
        onSkip();
      } else if (e.key === '1' || e.key === 'Enter') {
        e.preventDefault();
        onAccept();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onAccept, onSkip]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{
        background: COLOR_BACKDROP,
        backdropFilter: BACKDROP_BLUR,
        WebkitBackdropFilter: BACKDROP_BLUR,
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        data-folio-dialog
        className="relative w-full max-w-[720px] max-h-[calc(100vh-48px)] overflow-auto rounded-[12px] border border-border bg-popover px-8 pt-7 pb-6 text-popover-foreground"
        style={{
          boxShadow: MODAL_SHADOW,
          animation: RISE_ANIMATION,
        }}
      >
        <style>{`
          @keyframes folioDialogRise {
            from { opacity: 0; transform: translateY(6px); }
          }
          @media (prefers-reduced-motion: reduce) {
            [data-folio-dialog] { animation: none !important; }
          }
        `}</style>

        {/* Header */}
        <header className="text-center mb-[22px]">
          <div
            aria-hidden
            className="mx-auto mb-3 h-px w-10 bg-foreground opacity-45"
          />
          <div className="mb-2.5 text-[10px] font-normal uppercase tracking-[0.4em] text-muted-foreground">
            Chapter 0 · Welcome
          </div>
          <h1
            id="onboarding-title"
            className="m-0 text-[24px] font-semibold leading-[1.3] tracking-[-0.02em] text-popover-foreground"
            style={{ fontFamily: FONT_SERIF }}
          >
            이제, 첫 페이지를 펼칩니다.
          </h1>
        </header>

        {/* Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* 01 — 가이드 */}
          <button
            type="button"
            onClick={onAccept}
            disabled={busy}
            aria-label="예시와 함께 시작 (단축키 1)"
            className={cn(
              'group relative flex flex-col rounded-[8px] border border-border bg-card p-4 text-left transition-[border-color,box-shadow] duration-200',
              'hover:border-foreground hover:shadow-[0_1px_0_var(--border)]',
              busy && 'cursor-not-allowed opacity-60',
            )}
          >
            <div className="mb-2 flex items-center text-[10px] tracking-[0.3em] text-muted-foreground">
              <span>01</span>
              <span className="relative ml-3 pl-3 text-destructive">
                <span
                  aria-hidden
                  className="absolute left-0 top-1/2 h-px w-[7px] -translate-y-1/2 bg-destructive"
                />
                추천
              </span>
            </div>
            <h2
              className="m-0 mb-1 text-[17px] font-semibold leading-[1.3] tracking-[-0.015em] text-popover-foreground"
              style={{ fontFamily: FONT_SERIF }}
            >
              예시와 함께 시작
            </h2>
            <p
              className="m-0 mb-3 text-[12.5px] leading-[1.6] text-muted-foreground"
              style={{ fontFamily: FONT_SERIF }}
            >
              샘플 작품과 탭별 안내를 따라 흐름을 익힙니다.
            </p>

            {/* Miniature preview */}
            <div
              aria-hidden
              className="mb-3 rounded-[5px] border border-border/60 bg-popover px-3 pt-2.5 pb-2.5 text-[11.5px]"
            >
              <div className="mb-1.5 flex items-center gap-1.5 border-b border-border/60 pb-1.5">
                <span
                  className="text-[12px] font-bold text-popover-foreground"
                  style={{ fontFamily: FONT_SERIF }}
                >
                  ▦
                </span>
                <span
                  className="text-[12.5px] font-semibold text-popover-foreground"
                  style={{ fontFamily: FONT_SERIF }}
                >
                  {ONBOARDING_WORK.title}
                </span>
              </div>

              <div className="mb-0.5 text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground">
                회차 {ONBOARDING_EPISODES.length}
              </div>
              <ul className="m-0 list-none p-0">
                {ONBOARDING_EPISODES.slice(0, 3).map((e) => (
                  <li
                    key={e.title}
                    className="relative truncate pl-2.5 text-[11.5px] leading-[1.55] text-popover-foreground"
                  >
                    <span className="absolute left-0 text-muted-foreground">·</span>
                    {e.title}
                  </li>
                ))}
              </ul>

              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 border-t border-dashed border-border/60 pt-1.5 text-[10.5px] text-muted-foreground">
                <span>캐릭터 {ONBOARDING_CHARACTERS.length}</span>
                <span>세계관 {WORLD_NOTE_TEMPLATES.length}</span>
                <span>복선 {ONBOARDING_FORESHADOW.length}</span>
                <span>아이디어 {ONBOARDING_IDEAS.length}</span>
              </div>
            </div>

            <ul className="m-0 mb-3 list-none p-0">
              <FeatureLine>샘플 작품이 바로 생성됩니다</FeatureLine>
              <FeatureLine>탭별 도움말이 차례로 안내됩니다</FeatureLine>
            </ul>

            <div className="mt-auto flex items-center justify-between gap-2.5 border-t border-border/60 pt-2.5">
              <span className="text-[11px] leading-[1.4] text-muted-foreground">
                처음 써 보거나 흐름이 궁금한 분
              </span>
              <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[12px] font-medium text-destructive">
                {busy ? (
                  <>
                    <span
                      className="inline-block h-3 w-3 animate-spin rounded-full border border-destructive border-t-transparent"
                      aria-hidden
                    />
                    생성 중…
                  </>
                ) : (
                  <>
                    시작
                    <span
                      aria-hidden
                      className="inline-block transition-transform duration-200 group-hover:translate-x-[3px]"
                    >
                      →
                    </span>
                  </>
                )}
              </span>
            </div>
          </button>

          {/* 02 — 처음부터 */}
          <button
            type="button"
            onClick={onSkip}
            disabled={busy}
            aria-label="처음부터 시작 (단축키 2)"
            className={cn(
              'group relative flex flex-col rounded-[8px] border border-border bg-card p-4 text-left transition-[border-color,box-shadow] duration-200',
              'hover:border-foreground hover:shadow-[0_1px_0_var(--border)]',
              busy && 'cursor-not-allowed opacity-60',
            )}
          >
            <div className="mb-2 text-[10px] tracking-[0.3em] text-muted-foreground">
              02
            </div>
            <h2
              className="m-0 mb-1 text-[17px] font-semibold leading-[1.3] tracking-[-0.015em] text-popover-foreground"
              style={{ fontFamily: FONT_SERIF }}
            >
              처음부터 시작
            </h2>
            <p
              className="m-0 mb-3 text-[12.5px] leading-[1.6] text-muted-foreground"
              style={{ fontFamily: FONT_SERIF }}
            >
              빈 작업실에서 자기 호흡대로 첫 줄을 씁니다.
            </p>

            <div
              aria-hidden
              className="mb-3 flex h-[124px] items-center justify-center rounded-[5px] border border-dashed border-border bg-popover"
            >
              <div
                className="text-center text-[12px] italic leading-[1.6] text-muted-foreground"
                style={{ fontFamily: FONT_SERIF }}
              >
                <span
                  className="block text-[22px] font-light not-italic text-muted-foreground/50 mb-0.5"
                  style={{ fontFamily: FONT_SERIF }}
                >
                  ＋
                </span>
                새 작품
                <br />첫 페이지
              </div>
            </div>

            <ul className="m-0 mb-3 list-none p-0">
              <FeatureLine>빈 작업실에서 바로 시작합니다</FeatureLine>
              <FeatureLine>설정 → 도움말에서 가이드를 다시 받을 수 있습니다</FeatureLine>
            </ul>

            <div className="mt-auto flex items-center justify-between gap-2.5 border-t border-border/60 pt-2.5">
              <span className="text-[11px] leading-[1.4] text-muted-foreground">
                바로 집필하고 싶은 분
              </span>
              <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[12px] font-medium text-popover-foreground">
                시작
                <span
                  aria-hidden
                  className="inline-block transition-transform duration-200 group-hover:translate-x-[3px]"
                >
                  →
                </span>
              </span>
            </div>
          </button>
        </div>

        {/* Footer keyboard hint */}
        <footer className="mt-[18px] text-center text-[11px] text-muted-foreground">
          <Kbd>1</Kbd> 가이드 · <Kbd>2</Kbd> 처음부터 · <Kbd>Esc</Kbd> 닫기
        </footer>
      </section>
    </div>
  );
}

function FeatureLine({ children }: { children: ReactNode }) {
  return (
    <li className="relative pl-3.5 text-[11.5px] leading-[1.7] text-popover-foreground">
      <span aria-hidden className="absolute left-0 text-muted-foreground/50">
        —
      </span>
      {children}
    </li>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="mx-0.5 inline-block rounded-[3px] border border-border bg-card px-1.5 py-0 text-[10px] font-normal text-popover-foreground">
      {children}
    </kbd>
  );
}
