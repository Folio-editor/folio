import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  FilePlus2,
  LayoutTemplate,
  Loader2,
  PencilLine,
  Sparkles,
} from 'lucide-react';
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

interface DialogSize {
  w: number;
  h: number;
}

const ONBOARDING_DIALOG_SIZE_KEY = 'folio.onboardingGuide.size.v3';
const DIALOG_DEFAULT_W = 900;
const DIALOG_DEFAULT_H = 700;
const DIALOG_MIN_W = 720;
const DIALOG_MIN_H = 600;

function clampDialogSize(size: DialogSize): DialogSize {
  if (typeof window === 'undefined') return size;
  const maxW = Math.max(360, window.innerWidth - 32);
  const maxH = Math.max(360, window.innerHeight - 32);
  const minW = Math.min(DIALOG_MIN_W, maxW);
  const minH = Math.min(DIALOG_MIN_H, maxH);
  return {
    w: Math.max(minW, Math.min(size.w, maxW)),
    h: Math.max(minH, Math.min(size.h, maxH)),
  };
}

function loadDialogSize(): DialogSize {
  const fallback = clampDialogSize({ w: DIALOG_DEFAULT_W, h: DIALOG_DEFAULT_H });
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(ONBOARDING_DIALOG_SIZE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<DialogSize>;
    if (typeof parsed.w !== 'number' || typeof parsed.h !== 'number') return fallback;
    return clampDialogSize({ w: parsed.w, h: parsed.h });
  } catch {
    return fallback;
  }
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
  const [dialogSize, setDialogSize] = useState<DialogSize>(() => loadDialogSize());
  const resizeStateRef = useRef<{
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null>(null);

  const startResize = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    resizeStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startW: dialogSize.w,
      startH: dialogSize.h,
    };
  }, [dialogSize.h, dialogSize.w]);

  const handleResizeMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const state = resizeStateRef.current;
    if (!state) return;
    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    setDialogSize(
      clampDialogSize({
        w: state.startW + dx,
        h: state.startH + dy,
      }),
    );
  }, []);

  const stopResize = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!resizeStateRef.current) return;
    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    resizeStateRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) return;
    setDialogSize((prev) => clampDialogSize(prev));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    try {
      localStorage.setItem(ONBOARDING_DIALOG_SIZE_KEY, JSON.stringify(dialogSize));
    } catch {
      // ignore persistence failure
    }
  }, [dialogSize, open]);

  useEffect(() => {
    if (!open) return;
    const handleWindowResize = () => {
      setDialogSize((prev) => clampDialogSize(prev));
    };
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [open]);

  if (!open) return null;

  // 카드 미니어처에 노출할 태그 (장르 + 분위기 결합, 최대 5개)
  const previewTags = [
    ...ONBOARDING_PLAN_META.genres,
    ...ONBOARDING_PLAN_META.moods,
  ].slice(0, 5);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        style={{ width: dialogSize.w, height: dialogSize.h }}
        className="relative flex max-h-[calc(100vh-32px)] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-[22px] border border-border/80 bg-background shadow-2xl"
      >
        <div className="flex-1 overflow-y-auto p-4">
          {/* 헤더 */}
          <div className="mb-3.5">
            <div className="mb-2 flex items-center gap-2 text-primary">
              <Sparkles size={16} strokeWidth={1.75} />
              <span className="text-xs font-semibold uppercase tracking-[0.18em]">
                First Step
              </span>
            </div>
            <h3 className="text-[28px] font-semibold tracking-[-0.02em] text-foreground">
              Folio 에 오신 것을 환영합니다
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-[1.55] text-muted-foreground">
              처음엔 예시 작품으로 작업 흐름을 익히고, 익숙하다면 바로 내 작품부터
              시작하세요. 어떤 선택을 해도 나중에 설정에서 도움말을 다시 볼 수 있어요.
            </p>
          </div>

          {/* 두 카드 — 데스크탑 좌우, 모바일 세로 스택 */}
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          {/* ─── 좌측: 예시와 함께 시작 (가이드 워크스페이스) ─── */}
          <button
            type="button"
            onClick={onAccept}
            disabled={busy}
            className={cn(
              'group relative flex h-full flex-col rounded-[18px] border border-primary/30 bg-primary/[0.04] p-3 text-left transition-all',
              'hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/[0.06] hover:shadow-lg',
              busy && 'cursor-not-allowed opacity-60',
            )}
          >
            <div className="mb-2.5 flex items-start justify-between gap-3">
              <div>
                <div className="mb-1.5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/80 px-2.5 py-1 text-[11px] font-semibold text-primary">
                  <Sparkles size={12} strokeWidth={2} />
                  추천
                </div>
                <div className="flex items-center gap-2">
                  <BookOpen size={16} className="text-primary" strokeWidth={1.75} />
                  <span className="text-[18px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
                    예시와 함께 시작
                  </span>
                </div>
                <p className="mt-1 text-[13px] leading-[1.45] text-muted-foreground">
                  샘플 작품을 열고, 탭별 도움말과 함께 Folio 흐름을 빠르게 익혀요.
                </p>
              </div>
            </div>

            {/* 미니어처 프리뷰 박스 — 실제 워크스페이스 축소 */}
            <div className="mb-3 flex flex-col gap-2 rounded-xl border border-border/60 bg-background/80 p-2.5 text-[11px] shadow-sm">
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

            <p className="text-[13px] leading-[1.55] text-muted-foreground">
              저작권 만료 작품 『빨간 머리 앤』(L. M. 몽고메리, 1908)을 차용한 샘플 작품으로
              Folio 의 주요 탭과 작업 흐름을 빠르게 익힐 수 있어요.
            </p>

            <div className="mt-3 space-y-1.5">
              <ChoiceFeature icon={<LayoutTemplate size={14} strokeWidth={2} />}>
                샘플 작품이 바로 생성돼요
              </ChoiceFeature>
              <ChoiceFeature icon={<BookOpen size={14} strokeWidth={2} />}>
                탭별 도움말이 순서대로 자동 안내돼요
              </ChoiceFeature>
              <ChoiceFeature icon={<CheckCircle2 size={14} strokeWidth={2} />}>
                둘러본 뒤에도 설정에서 다시 볼 수 있어요
              </ChoiceFeature>
            </div>

            <div className="mt-3 flex items-center gap-3 rounded-xl border border-primary/15 bg-background/85 px-3 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground">이런 분께 추천</p>
                <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">
                  처음 써보거나 전체 흐름을 먼저 보고 싶은 경우
                </p>
              </div>
              {busy ? (
                <div className="flex shrink-0 items-center gap-1.5 font-semibold text-primary">
                  <Loader2 size={13} className="animate-spin" />
                  <span>생성 중…</span>
                </div>
              ) : (
                <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap font-semibold text-primary">
                  <span>가이드 시작</span>
                  <ArrowRight size={15} strokeWidth={2} />
                </div>
              )}
            </div>
          </button>

          {/* ─── 우측: 처음부터 시작 (빈 워크스페이스) ─── */}
          <button
            type="button"
            onClick={onSkip}
            disabled={busy}
            className={cn(
              'group relative flex h-full flex-col rounded-[18px] border border-border bg-card p-3 text-left transition-all',
              'hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/[0.03] hover:shadow-lg',
              busy && 'cursor-not-allowed opacity-60',
            )}
          >
            <div className="mb-2.5">
              <div className="mb-1.5 inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                <PencilLine size={12} strokeWidth={2} />
                직접 시작
              </div>
              <div className="flex items-center gap-2">
                <FilePlus2 size={16} className="text-foreground" strokeWidth={1.75} />
                <span className="text-[18px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
                  처음부터 시작
                </span>
              </div>
              <p className="mt-1 text-[13px] leading-[1.45] text-muted-foreground">
                빈 작업실에서 바로 시작하고, 내 방식대로 작품 구조를 직접 쌓아가요.
              </p>
            </div>

            {/* 미니어처 프리뷰 — 빈 화면 */}
            <div className="mb-3 flex h-[140px] items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/25">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border/70 bg-background shadow-sm">
                  <FilePlus2 size={20} strokeWidth={1.5} />
                </div>
                <span className="text-sm font-medium">＋ 새 작품</span>
              </div>
            </div>

            <p className="text-[13px] leading-[1.55] text-muted-foreground">
              자신만의 작품을 처음부터 자유롭게 만들어 보세요. 가이드는 언제든
              <span className="font-medium text-foreground"> 설정 → 도움말</span>
              에서 다시 받을 수 있어요.
            </p>

            <div className="mt-3 space-y-1.5">
              <ChoiceFeature icon={<FilePlus2 size={14} strokeWidth={2} />}>
                빈 작업실에서 바로 시작해요
              </ChoiceFeature>
              <ChoiceFeature icon={<PencilLine size={14} strokeWidth={2} />}>
                작품과 구조를 직접 만들 수 있어요
              </ChoiceFeature>
              <ChoiceFeature icon={<CheckCircle2 size={14} strokeWidth={2} />}>
                필요하면 나중에 튜토리얼을 다시 볼 수 있어요
              </ChoiceFeature>
            </div>

            <div className="mt-3 flex items-center gap-3 rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground">이런 분께 추천</p>
                <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">
                  이미 흐름을 알고 있고 바로 집필하고 싶은 경우
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap font-semibold text-foreground">
                <span>처음부터 시작</span>
                <ArrowRight size={15} strokeWidth={2} />
              </div>
            </div>
          </button>
          </div>
        </div>

        <div
          role="separator"
          aria-label="가이드 창 크기 조절"
          onPointerDown={startResize}
          onPointerMove={handleResizeMove}
          onPointerUp={stopResize}
          onPointerCancel={stopResize}
          className="absolute bottom-0 right-0 h-5 w-5 cursor-nwse-resize"
          style={{
            background:
              'linear-gradient(135deg, transparent 45%, var(--muted-foreground) 45%, var(--muted-foreground) 55%, transparent 55%, transparent 65%, var(--muted-foreground) 65%, var(--muted-foreground) 75%, transparent 75%)',
            opacity: 0.35,
          }}
        />
      </div>
    </div>
  );
}

function ChoiceFeature({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-sm text-foreground/90">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </span>
      <span>{children}</span>
    </div>
  );
}
