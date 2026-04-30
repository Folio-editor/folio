import { BookOpen, FilePlus2, Loader2, Sparkles } from 'lucide-react';
import {
  ONBOARDING_WORK,
  ONBOARDING_EPISODES,
  ONBOARDING_CHARACTERS,
  ONBOARDING_FORESHADOW,
  ONBOARDING_PLAN_META,
} from '../../constants/onboardingContent';
import { cn } from '../../lib/cn';

interface OnboardingGuideDialogProps {
  open: boolean;
  busy: boolean;
  onAccept: () => void; // 좌측 카드 — 가이드 워크스페이스 생성
  onSkip: () => void; // 우측 카드 — 빈 워크스페이스로 시작
}

/**
 * 신규 사용자 + 가이드 작품 미존재 상태에서 자동 노출되는 환영 다이얼로그.
 *
 * 두 카드 좌우 배치:
 *   - 좌측: 빨간 머리 앤 샘플 워크스페이스 미니어처 프리뷰 (CSS/div 만으로 그려짐)
 *   - 우측: 빈 워크스페이스 일러스트
 *
 * 두 선택 모두 5단계 웰컴 투어로 이어진다 (AuthenticatedApp 의 handleOnboardingSkip 에서 트리거).
 */
export function OnboardingGuideDialog({
  open,
  busy,
  onAccept,
  onSkip,
}: OnboardingGuideDialogProps) {
  if (!open) return null;

  // 카드 미니어처에 노출할 태그 (장르 + 분위기 결합, 최대 5개)
  const previewTags = [
    ...ONBOARDING_PLAN_META.genres,
    ...ONBOARDING_PLAN_META.moods,
  ].slice(0, 5);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-3xl rounded-lg border border-border bg-background p-6 shadow-xl">
        {/* 헤더 */}
        <div className="mb-1 flex items-center gap-2">
          <Sparkles size={18} className="text-primary" strokeWidth={1.75} />
          <h3 className="text-base font-semibold text-foreground">
            Folio 에 오신 것을 환영합니다
          </h3>
        </div>
        <p className="mb-5 text-sm text-muted-foreground">
          어떻게 시작하시겠어요?
        </p>

        {/* 두 카드 — 데스크탑 좌우, 모바일 세로 스택 */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
          {/* ─── 좌측: 예시와 함께 시작 (가이드 워크스페이스) ─── */}
          <button
            type="button"
            onClick={onAccept}
            disabled={busy}
            className={cn(
              'group relative flex flex-col rounded-xl border-2 border-border bg-card p-4 text-left transition-all',
              'hover:border-primary hover:bg-primary/5 hover:shadow-md',
              busy && 'cursor-not-allowed opacity-60',
            )}
          >
            <div className="mb-3 flex items-center gap-2">
              <BookOpen size={16} className="text-primary" strokeWidth={1.75} />
              <span className="text-sm font-semibold text-foreground">
                예시와 함께 시작
              </span>
            </div>

            {/* 미니어처 프리뷰 박스 — 실제 워크스페이스 축소 */}
            <div className="mb-3 flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-[11px]">
              {/* 작품 헤더 */}
              <div className="flex items-center gap-1.5 border-b border-border/40 pb-1.5">
                <span className="text-sm">📘</span>
                <span className="truncate font-semibold text-foreground">
                  {ONBOARDING_WORK.title}
                </span>
              </div>

              {/* 회차 리스트 */}
              <div>
                <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  ▸ 회차 ({ONBOARDING_EPISODES.length})
                </div>
                <ul className="space-y-0.5 pl-3 text-foreground/85">
                  {ONBOARDING_EPISODES.map((e) => (
                    <li key={e.title} className="truncate">
                      · {e.title}
                    </li>
                  ))}
                </ul>
              </div>

              {/* 캐릭터/복선/세계관/기획/아이디어 요약 */}
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                <span>▸ 캐릭터 {ONBOARDING_CHARACTERS.length}명</span>
                <span>▸ 세계관 5</span>
                <span>▸ 복선 {ONBOARDING_FORESHADOW.length}</span>
                <span>▸ 기획서 1</span>
                <span>▸ 아이디어 3</span>
              </div>

              {/* 태그 칩 */}
              <div className="mt-1 flex flex-wrap gap-1">
                {previewTags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <p className="flex-1 text-xs leading-relaxed text-muted-foreground">
              저작권 만료 작품 『빨간 머리 앤』(L. M. 몽고메리, 1908)을 차용한 샘플 작품으로 Folio 의 모든 기능을 한눈에 살펴볼 수 있어요.
            </p>

            <div className="mt-3 flex items-center justify-end gap-1.5 text-xs font-semibold text-primary">
              {busy ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>생성 중…</span>
                </>
              ) : (
                <>
                  <Sparkles size={13} strokeWidth={2} />
                  <span>가이드 시작 →</span>
                </>
              )}
            </div>
          </button>

          {/* ─── 우측: 처음부터 시작 (빈 워크스페이스) ─── */}
          <button
            type="button"
            onClick={onSkip}
            disabled={busy}
            className={cn(
              'group relative flex flex-col rounded-xl border-2 border-border bg-card p-4 text-left transition-all',
              'hover:border-primary hover:bg-primary/5 hover:shadow-md',
              busy && 'cursor-not-allowed opacity-60',
            )}
          >
            <div className="mb-3 flex items-center gap-2">
              <FilePlus2 size={16} className="text-foreground" strokeWidth={1.75} />
              <span className="text-sm font-semibold text-foreground">
                처음부터 시작
              </span>
            </div>

            {/* 미니어처 프리뷰 — 빈 화면 */}
            <div className="mb-3 flex h-45 items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/30">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background shadow-sm">
                  <FilePlus2 size={20} strokeWidth={1.5} />
                </div>
                <span className="text-xs font-medium">＋ 새 작품</span>
              </div>
            </div>

            <p className="flex-1 text-xs leading-relaxed text-muted-foreground">
              자신만의 작품을 처음부터 자유롭게 만들어 보세요. 가이드는 언제든
              <span className="font-medium text-foreground"> 설정 → 도움말</span>
              에서 다시 받을 수 있어요.
            </p>

            <div className="mt-3 flex items-center justify-end gap-1.5 text-xs font-semibold text-foreground">
              <span>처음부터 시작 →</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
