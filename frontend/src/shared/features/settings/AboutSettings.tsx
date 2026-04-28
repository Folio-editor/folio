import { useState } from 'react';
import { AlertCircle, CheckCircle2, Download, RefreshCw, RotateCw } from 'lucide-react';
import { useUpdater } from '../../hooks/useUpdater';
import { cn } from '../../lib/cn';

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

export function AboutSettings() {
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
