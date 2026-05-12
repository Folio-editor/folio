import { useRef, useState } from 'react';
import { useQuery } from '@powersync/react';
import { AlertCircle, Bug, CheckCircle2, ClipboardList, Download, ExternalLink, RefreshCw, RotateCw } from 'lucide-react';
import { FEEDBACK_LINKS, openExternalLink } from '../../constants/externalLinks';
import { useUpdater } from '../../hooks/useUpdater';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { useOnboardingSeed } from '../../hooks/useOnboardingSeed';
import { useWriterId } from '../../hooks/useWriterId';
import { ONBOARDING_WORK } from '../../constants/onboardingContent';
import { resetTabHelpShownFlags } from '../../constants/tabHelpContent';
import { DeleteConfirmDialog } from '../../components/ui/DeleteConfirmDialog';
import { cn } from '../../lib/cn';

interface AboutSettingsProps {
  /** "튜토리얼 가이드 다시 시작" 후 호출 — 부모에서 새 workId 로 home 진입 + 설정 닫기 */
  onTutorialReset?: (newWorkId: string) => void;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0B';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

function formatRate(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function AboutSettings({ onTutorialReset }: AboutSettingsProps = {}) {
  const {
    currentVersion,
    state,
    lastCheckedAt,
    isWeb,
    isBusy,
    check,
    download,
    installAndRestart,
  } = useUpdater();
  const [confirmingInstall, setConfirmingInstall] = useState(false);

  // ── 튜토리얼 가이드 다시 시작 ─────────────────────────────────
  const writerId = useWriterId();
  const { deleteWork } = useLocalWrite();
  const { seed: seedOnboarding } = useOnboardingSeed();
  const [restartConfirm, setRestartConfirm] = useState(false);
  const [restartBusy, setRestartBusy] = useState(false);

  // 가이드 작품 식별 — kind = 'onboarding' 평문 컬럼 매칭 (ciphertext 무관 안전)
  const { data: guideRows = [] } = useQuery<{ id: string }>(
    writerId
      ? `SELECT id FROM work
         WHERE writer_id = ? AND kind = 'onboarding' AND status != 'trashed' LIMIT 1`
      : `SELECT '' AS id WHERE 0`,
    writerId ? [writerId] : [],
  );
  const matchedGuide = guideRows[0];
  const hasMatchedGuide = matchedGuide !== undefined;

  // setRestartBusy 만으론 동기 재진입 차단 불가 (setState async). useRef 로 즉시 락 — Enter spam /
  // 더블 클릭 / 동시 IPC 호출 등에서 시드가 2회 실행되어 가이드 작품이 통째로 두 세트 생성되는
  // 회귀 차단. AuthenticatedApp 의 onboardingSeedingRef 와 동일 패턴.
  const restartingRef = useRef(false);
  const restartTutorial = async () => {
    if (restartingRef.current) return;
    restartingRef.current = true;
    setRestartBusy(true);
    try {
      // 기존 가이드 작품(매칭된 경우)을 휴지통으로 이동 — description 마커 없는 사용자 작품은 보존
      if (matchedGuide) {
        await deleteWork(matchedGuide.id);
      }
      // 새 빨간머리앤 샘플 워크스페이스 즉시 시드
      const newWorkId = await seedOnboarding();
      // localStorage 초기화 — 환영 다이얼로그(2개) + 8개 탭별 도움말 자동 노출 플래그
      localStorage.removeItem('folio.onboarding.guideOffered');
      localStorage.removeItem('folio.welcomeTour.completed');
      resetTabHelpShownFlags();
      setRestartConfirm(false);
      // 부모로 콜백 — home 진입 + 설정 닫기 → home 탭 도움말이 자동 1회 노출
      onTutorialReset?.(newWorkId);
    } finally {
      setRestartBusy(false);
      restartingRef.current = false;
    }
  };

  const handleRestartClick = () => {
    if (hasMatchedGuide) {
      // 기존 가이드 작품 있으면 휴지통 이동 경고 모달
      setRestartConfirm(true);
    } else {
      // 작품 없으면 즉시 시드 + 진입
      void restartTutorial();
    }
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-10 shrink-0 items-center border-b border-border px-6">
        <h2 className="text-sm font-semibold text-foreground">앱 정보 / 업데이트</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-lg space-y-6">
          {/* 현재 버전 + 확인 트리거 */}
          <Section title="현재 버전">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  Folio {currentVersion ?? '–'}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {lastCheckedAt
                    ? `마지막 확인: ${formatDateTime(lastCheckedAt)}`
                    : '아직 업데이트를 확인하지 않았습니다'}
                </p>
              </div>
              {!isWeb && (
                <button
                  type="button"
                  onClick={() => void check()}
                  disabled={isBusy}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-ring px-3 py-1.5 text-xs font-medium text-background transition-colors hover:bg-ring/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw
                    size={13}
                    className={cn(state.phase === 'checking' && 'animate-spin')}
                  />
                  {state.phase === 'checking' ? '확인 중…' : '업데이트 확인'}
                </button>
              )}
            </div>
          </Section>

          {/* 웹 안내 */}
          {isWeb && (
            <p className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
              웹 버전은 브라우저가 새 버전을 자동으로 로드합니다. 데스크탑 앱에서 자동
              업데이트를 사용하려면 Folio 앱을 설치해 주세요.
            </p>
          )}

          {/* dev 빌드 안내 */}
          {!isWeb && state.phase === 'unsupported' && (
            <p className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
              개발 빌드에서는 자동 업데이트가 비활성화됩니다. 패키지 설치본에서만 동작합니다.
            </p>
          )}

          {/* 최신 상태 */}
          {!isWeb && state.phase === 'not-available' && (
            <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-xs text-success">
              <CheckCircle2 size={14} />
              <span>최신 버전을 사용 중입니다.</span>
            </div>
          )}

          {/* 사용 가능한 새 버전 */}
          {!isWeb && state.phase === 'available' && state.version && (
            <Section title="새 버전 사용 가능">
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Folio {state.version}
                  </p>
                  {state.releaseDate && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      릴리스: {state.releaseDate}
                    </p>
                  )}
                </div>
                {state.releaseNotes && (
                  <div className="rounded-md border border-border bg-muted/40 p-3">
                    <p className="mb-1 text-[11px] font-semibold text-muted-foreground">
                      릴리스 노트
                    </p>
                    <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground">
                      {state.releaseNotes}
                    </pre>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => void download()}
                  disabled={isBusy}
                  className="flex items-center gap-1.5 rounded-lg bg-ring px-3 py-2 text-xs font-medium text-background transition-colors hover:bg-ring/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download size={13} />
                  지금 다운로드
                </button>
              </div>
            </Section>
          )}

          {/* 다운로드 진행 */}
          {!isWeb && state.phase === 'downloading' && (
            <Section title="다운로드 진행">
              <DownloadProgress
                percent={state.progress?.percent ?? 0}
                bytesPerSecond={state.progress?.bytesPerSecond ?? 0}
                transferred={state.progress?.transferred ?? 0}
                total={state.progress?.total ?? 0}
              />
            </Section>
          )}

          {/* 설치 준비 완료 */}
          {!isWeb && state.phase === 'downloaded' && (
            <Section title="설치 준비 완료">
              <div className="space-y-3">
                <p className="text-xs text-foreground">
                  Folio {state.version} 다운로드가 완료되었습니다. 앱을 재시작하면 새 버전이
                  설치됩니다.
                </p>
                {!confirmingInstall ? (
                  <button
                    type="button"
                    onClick={() => setConfirmingInstall(true)}
                    className="flex items-center gap-1.5 rounded-lg bg-ring px-3 py-2 text-xs font-medium text-background transition-colors hover:bg-ring/90"
                  >
                    <RotateCw size={13} />
                    지금 재시작 후 설치
                  </button>
                ) : (
                  <InstallConfirm
                    onCancel={() => setConfirmingInstall(false)}
                    onConfirm={() => void installAndRestart()}
                  />
                )}
              </div>
            </Section>
          )}

          {/* 사용자 설문 */}
          <Section title="사용자 설문">
            <FeedbackSection
              icon={<ClipboardList size={16} className="text-info" strokeWidth={1.75} />}
              title="Folio 사용자 설문"
              description="제품 개선과 새 기능 우선순위 결정을 위한 짧은 설문입니다. 응답이 큰 도움이 됩니다."
              buttonLabel="설문 참여하기"
              url={FEEDBACK_LINKS.survey}
            />
          </Section>

          {/* 버그 리포트 */}
          <Section title="버그 리포트">
            <FeedbackSection
              icon={<Bug size={16} className="text-danger" strokeWidth={1.75} />}
              title="문제가 발생했나요?"
              description="버그·오류·이상 동작을 알려주세요. 재현 방법과 환경을 함께 적어주시면 빠르게 해결할 수 있습니다."
              buttonLabel="버그 신고하기"
              url={FEEDBACK_LINKS.bug}
            />
          </Section>

          {/* 도움말 — 튜토리얼 가이드 다시 시작 */}
          <Section title="도움말">
            <div className="space-y-4">
              <div>
                <div
                  aria-hidden
                  className="mb-2 h-px w-7 bg-[#111] opacity-45"
                />
                <p
                  className="m-0 text-[15px] font-semibold leading-[1.4] tracking-[-0.01em] text-[#111]"
                  style={{
                    fontFamily:
                      "'Noto Serif KR', 'Nanum Myeongjo', Georgia, serif",
                  }}
                >
                  Folio 첫 사용자 가이드
                </p>
                <p
                  className="m-0 mt-1.5 text-[12.5px] leading-[1.6] text-[#6b6b6b]"
                  style={{
                    fontFamily:
                      "'Noto Serif KR', 'Nanum Myeongjo', Georgia, serif",
                  }}
                >
                  {hasMatchedGuide
                    ? '기존 샘플 작품을 휴지통으로 옮기고 새 샘플로 즉시 이동합니다.'
                    : '샘플 작품을 만들고 즉시 이동해 각 탭 도움말을 다시 보여드립니다.'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleRestartClick}
                disabled={restartBusy}
                className="inline-flex items-center gap-2 rounded-[6px] border border-[#d4d4d4] bg-white px-4 py-1.5 text-[12.5px] font-medium text-[#111] transition-[border-color,background-color] duration-150 hover:border-[#111] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {restartBusy ? (
                  <>
                    <span
                      className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent"
                      aria-hidden
                    />
                    처리 중…
                  </>
                ) : (
                  <>
                    튜토리얼 가이드 다시 시작
                    <span aria-hidden>→</span>
                  </>
                )}
              </button>

              <div className="mt-2 pt-3 border-t border-[#e5e5e2] flex items-center gap-2 text-[11.5px] text-[#6b6b6b]">
                <span>편집 단축키 / 마크다운 안내는 언제든</span>
                <kbd className="inline-flex h-[18px] items-center rounded-[3px] border border-[#d4d4d4] border-b-[1.5px] bg-white px-1.5 text-[10px] text-[#111]" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                  F1
                </kbd>
                <span>키로 열 수 있어요.</span>
              </div>
            </div>
          </Section>

          {/* 에러 */}
          {!isWeb && state.phase === 'error' && (
            <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3">
              <div className="flex items-start gap-2 text-xs">
                <AlertCircle size={14} className="mt-0.5 shrink-0 text-danger" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-danger">업데이트 처리 중 오류</p>
                  <p className="mt-1 break-words text-muted-foreground">
                    {state.error ?? '알 수 없는 오류가 발생했습니다'}
                  </p>
                  <button
                    type="button"
                    onClick={() => void check()}
                    disabled={isBusy}
                    className="mt-3 flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    <RefreshCw size={12} />
                    다시 시도
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 튜토리얼 다시 시작 확인 다이얼로그 (가이드 작품이 있는 경우만) */}
      {restartConfirm && (
        <DeleteConfirmDialog
          title="튜토리얼 가이드 다시 시작"
          message={`기존 샘플 작품 '${ONBOARDING_WORK.title}' 을 휴지통으로 옮기고 새 샘플 워크스페이스로 즉시 이동합니다. 30일 안에 휴지통에서 복원할 수 있습니다.`}
          warning="작품 안에서 작성하신 내용은 함께 휴지통으로 이동합니다."
          confirmLabel="다시 시작"
          busyLabel="처리 중…"
          busy={restartBusy}
          onConfirm={() => void restartTutorial()}
          onCancel={() => setRestartConfirm(false)}
        />
      )}
    </div>
  );
}

function FeedbackSection({
  icon,
  title,
  description,
  buttonLabel,
  url,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  buttonLabel: string;
  url: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
        <button
          type="button"
          onClick={() => openExternalLink(url)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-foreground/40 hover:bg-muted"
        >
          {buttonLabel}
          <ExternalLink size={11} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2.5 text-xs font-semibold text-muted-foreground">{title}</h3>
      <div className="rounded-xl border border-border p-4">{children}</div>
    </div>
  );
}

function DownloadProgress({
  percent,
  bytesPerSecond,
  transferred,
  total,
}: {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">진행률</span>
        <span className="font-medium text-foreground">{clamped.toFixed(1)}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-ring transition-all duration-300"
          style={{ width: `${clamped}%` }}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        {formatBytes(transferred)} / {formatBytes(total)} · {formatRate(bytesPerSecond)}
      </p>
    </div>
  );
}

function InstallConfirm({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="space-y-2 rounded-md border border-warning/30 bg-warning/10 p-3">
      <p className="text-xs font-medium text-warning">앱이 즉시 종료됩니다</p>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        저장되지 않은 작업은 손실될 수 있습니다. 계속하시겠습니까?
      </p>
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-md bg-warning px-3 py-1.5 text-xs font-medium text-background transition-colors hover:bg-warning/90"
        >
          재시작 후 설치
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          취소
        </button>
      </div>
    </div>
  );
}
