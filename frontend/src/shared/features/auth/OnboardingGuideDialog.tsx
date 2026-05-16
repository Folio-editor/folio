import { useEffect, type ReactNode } from 'react';
import {
  ONBOARDING_WORK,
  ONBOARDING_EPISODES,
  ONBOARDING_CHARACTERS,
  ONBOARDING_FORESHADOW,
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
        className="relative w-full max-w-190 max-h-[calc(100vh-48px)] overflow-auto rounded-[12px] border border-border bg-popover px-10 pt-10 pb-8 text-popover-foreground"
        style={{
          boxShadow: MODAL_SHADOW,
          animation: RISE_ANIMATION,
        }}
        aria-label="시작 흐름 선택"
      >
        <style>{`
          @keyframes folioDialogRise {
            from { opacity: 0; transform: translateY(6px); }
          }
          @media (prefers-reduced-motion: reduce) {
            [data-folio-dialog] { animation: none !important; }
          }
        `}</style>

        {/* 헤더 — 환영 메시지 한 줄 */}
        <header className="mb-8 text-center">
          <div
            aria-hidden
            className="mx-auto mb-4 h-px w-10 bg-foreground opacity-40"
          />
          <h1
            id="onboarding-title"
            className="m-0 text-[26px] font-medium leading-[1.3] tracking-[-0.015em] text-popover-foreground"
            style={{ fontFamily: FONT_SERIF }}
          >
            환영합니다
          </h1>
          <p className="mt-2 text-[12.5px] leading-[1.6] text-muted-foreground">
            첫 페이지로 들어갈 두 갈래 중 하나를 골라주세요.
          </p>
        </header>

        {/* 두 갈래 — 각각 카드 안에 정리. 카드 전체가 클릭 영역(button). */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <BranchCard
            label="갈래 A"
            heading="예시와 함께 시작"
            description={
              <>
                가이드 작품 <span className="font-medium text-popover-foreground">「{ONBOARDING_WORK.title}」</span>이
                미리 채워져 있습니다. 인물·세계관·플롯·{ONBOARDING_EPISODES.length}화 원고가 모두 들어 있어 도구를 빠르게 둘러보기에 좋습니다.
              </>
            }
            preview={
              <div className="rounded-[6px] border border-border bg-background/60 px-4 py-3">
                <p
                  className="m-0 mb-1 text-[14px] font-semibold leading-[1.4] text-popover-foreground"
                  style={{ fontFamily: FONT_SERIF }}
                >
                  {ONBOARDING_WORK.title}
                </p>
                <p className="m-0 text-[11.5px] leading-[1.6] text-muted-foreground">
                  {ONBOARDING_EPISODES.length}화 분량 · 인물 {ONBOARDING_CHARACTERS.length} ·
                  세계관 {WORLD_NOTE_TEMPLATES.length} · 복선 {ONBOARDING_FORESHADOW.length}
                </p>
                <div className="mt-3 border-t border-border/60 pt-2 text-[11px] leading-[1.6] text-muted-foreground/80">
                  예시 작품 · 자유롭게 수정 · 삭제 가능
                </div>
              </div>
            }
            scenarios={[
              '도구를 먼저 둘러보고 싶을 때',
              '설정·플롯이 어떻게 연결되는지 보고 싶을 때',
            ]}
            onClick={onAccept}
            busy={busy}
            busyLabel="생성 중…"
            ariaLabel="예시와 함께 시작 (단축키 1)"
          />

          <BranchCard
            label="갈래 B"
            heading="처음부터 시작"
            description="빈 작품을 만들고 제목 한 줄에서 출발합니다. 인물도 세계관도 쌓이는 대로 채우면 됩니다."
            preview={
              <div
                aria-hidden
                className="flex h-30 items-center justify-center rounded-[6px] border border-dashed border-border"
              >
                <div
                  className="text-center text-[13px] leading-normal text-muted-foreground"
                  style={{ fontFamily: FONT_SERIF }}
                >
                  <span className="block text-[24px] font-light text-muted-foreground/60 mb-1">＋</span>
                  새 작품
                </div>
              </div>
            }
            scenarios={[
              '이미 머릿속에 작품이 있을 때',
              '나만의 구조로 비워두고 싶을 때',
            ]}
            onClick={onSkip}
            busy={busy}
            busyLabel="이동 중…"
            ariaLabel="처음부터 시작 (단축키 2 / Esc)"
          />
        </div>
      </section>
    </div>
  );
}

interface BranchCardProps {
  label: string;
  heading: string;
  description: ReactNode;
  preview: ReactNode;
  scenarios: string[];
  onClick: () => void;
  busy: boolean;
  busyLabel: string;
  ariaLabel: string;
}

function BranchCard({
  label,
  heading,
  description,
  preview,
  scenarios,
  onClick,
  busy,
  busyLabel,
  ariaLabel,
}: BranchCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={ariaLabel}
      className={cn(
        'group flex w-full flex-col gap-4 rounded-[10px] border border-border bg-card p-6 text-left transition-[border-color,box-shadow] duration-200',
        'hover:border-foreground/60 hover:shadow-[0_1px_0_var(--border)]',
        busy && 'cursor-not-allowed opacity-60',
      )}
    >
      {/* 갈래 라벨 + 가로선 */}
      <div className="flex items-center gap-3">
        <span className="text-[10.5px] tracking-[0.22em] text-muted-foreground">
          {label}
        </span>
        <span aria-hidden className="h-px flex-1 bg-border" />
      </div>

      {/* 헤딩 */}
      <h2
        className="m-0 text-[20px] font-medium leading-[1.3] tracking-[-0.01em] text-popover-foreground"
        style={{ fontFamily: FONT_SERIF }}
      >
        {heading}
      </h2>

      {/* 설명 */}
      <p
        className="m-0 text-[12.5px] leading-[1.7] text-muted-foreground"
        style={{ fontFamily: FONT_SERIF }}
      >
        {description}
      </p>

      {/* 작품 미리보기 */}
      {preview}

      {/* 시나리오 bullet */}
      <ul className="m-0 mt-auto flex list-none flex-col gap-1.5 border-t border-border/60 p-0 pt-4">
        {scenarios.map((s) => (
          <li
            key={s}
            className="relative pl-3.5 text-[12px] leading-[1.55] text-popover-foreground/80"
          >
            <span aria-hidden className="absolute left-0 top-0 text-muted-foreground/60">
              ·
            </span>
            {s}
          </li>
        ))}
      </ul>

      {busy && (
        <span className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <span
            aria-hidden
            className="inline-block h-3 w-3 animate-spin rounded-full border border-muted-foreground border-t-transparent"
          />
          {busyLabel}
        </span>
      )}
    </button>
  );
}
