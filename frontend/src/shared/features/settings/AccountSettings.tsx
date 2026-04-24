import { useEffect, useState } from 'react';
import { Cloud, CloudOff, HardDrive, LogOut, RefreshCw, Sparkles } from 'lucide-react';
import { useQuery, useStatus } from '@powersync/react';
import { db } from '../../../renderer/sync/db';
import { useAuthStore } from '../../stores/authStore';
import { useIsGuest } from '../../hooks/useWriterId';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useAccountInfo, useCachedAccountInfo, type CachedAccountInfo } from '../../hooks/useAccountInfo';
import { cn } from '../../lib/cn';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google 계정으로 로그인됨',
};

/** ps_crud 큐 대기 건수 임계값 */
const SYNC_WARN_THRESHOLD = 100;
const SYNC_CRITICAL_THRESHOLD = 1000;

/** 로컬 SQLite DB 크기 + 동기화 대기 건수를 조회하는 훅 */
function useLocalStorageStats() {
  const [localBytes, setLocalBytes] = useState(0);

  // PRAGMA는 reactive가 아니므로 주기적(30초) + 마운트 시 조회
  useEffect(() => {
    async function measure() {
      try {
        const pcRes = await db.execute('PRAGMA page_count');
        const psRes = await db.execute('PRAGMA page_size');
        const pageCount = Number(pcRes.rows?.item(0)?.page_count ?? 0);
        const pageSize = Number(psRes.rows?.item(0)?.page_size ?? 0);
        setLocalBytes(pageCount * pageSize);
      } catch {
        // PRAGMA 미지원 환경 대비
      }
    }
    measure();
    const id = setInterval(measure, 30_000);
    return () => clearInterval(id);
  }, []);

  // ps_crud 큐 건수는 reactive query로 실시간 반영
  const { data: queueRows = [] } = useQuery<{ cnt: number }>(
    'SELECT count(*) as cnt FROM ps_crud',
    [],
  );
  const pendingCount = queueRows[0]?.cnt ?? 0;

  return { localBytes, pendingCount };
}

export function AccountSettings() {
  const isGuest = useIsGuest();

  if (isGuest) return <GuestView />;
  return <AuthenticatedView />;
}

function GuestView() {
  const login = useAuthStore((s) => s.login);
  const isLoggingIn = useAuthStore((s) => s.isLoggingIn);
  const { localBytes, pendingCount } = useLocalStorageStats();
  const cached = useCachedAccountInfo();

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center border-b border-border px-6">
        <h2 className="text-sm font-semibold text-foreground">계정</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-lg space-y-6">
          {/* 게스트 안내 */}
          <div className="rounded-xl border border-border bg-muted/30 p-5">
            <p className="text-sm font-medium text-foreground">게스트 모드</p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              현재 로컬에서만 작업 중입니다.
              <br />
              로그인하면 클라우드 동기화와 AI 기능을 사용할 수 있습니다.
            </p>
            <button
              type="button"
              onClick={() => void login()}
              disabled={isLoggingIn}
              className="mt-4 rounded-lg bg-ring px-4 py-2 text-xs font-medium text-background transition-colors hover:bg-ring/90 disabled:opacity-50"
            >
              {isLoggingIn ? '로그인 중…' : 'Google로 로그인'}
            </button>
          </div>

          {/* 클라우드 사용량 (캐시) */}
          {cached && <CachedCloudUsageSection cached={cached} />}

          {/* 로컬 저장소 */}
          <LocalStorageSection localBytes={localBytes} />

          {/* 동기화 대기 (게스트: 로그인하면 동기화됨) */}
          {pendingCount > 0 && (
            <Section title="동기화 대기">
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  로그인하면 {pendingCount.toLocaleString()}건의 변경사항이 클라우드에 동기화됩니다.
                </p>
                <SyncPendingGauge pendingCount={pendingCount} connected={false} />
              </div>
            </Section>
          )}

          {/* 서비스 현황 */}
          <Section title="서비스 현황">
            <div className="space-y-2">
              <StatusRow label="로컬 저장" value="제한 없음" />
              <StatusRow
                label="클라우드 동기화"
                value="사용 불가"
                icon={<CloudOff size={13} className="text-muted-foreground/60" />}
              />
              <StatusRow
                label="AI 기능"
                value="사용 불가"
                icon={<Sparkles size={13} className="text-muted-foreground/60" />}
              />
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function AuthenticatedView() {
  const { data, loading } = useAccountInfo();
  const logout = useAuthStore((s) => s.logout);
  const { localBytes, pendingCount } = useLocalStorageStats();
  const psStatus = useStatus();
  const isOnline = useNetworkStatus();

  if (loading || !data) {
    return (
      <div className="flex h-full flex-col bg-background">
        <div className="flex h-12 shrink-0 items-center border-b border-border px-6">
          <h2 className="text-sm font-semibold text-foreground">계정</h2>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <span className="text-xs text-muted-foreground">
            {loading ? '불러오는 중…' : '계정 정보를 불러올 수 없습니다'}
          </span>
        </div>
      </div>
    );
  }

  const { writer, plan, usage, subscription } = data;
  const storageWarning = usage.storagePercent >= 80 && !usage.quotaExceeded;
  const storageFull = usage.quotaExceeded;

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center border-b border-border px-6">
        <h2 className="text-sm font-semibold text-foreground">계정</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-lg space-y-6">
          {/* 프로필 */}
          <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4">
            {writer.profileImageUrl ? (
              <img
                src={writer.profileImageUrl}
                alt=""
                className="h-10 w-10 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ring/20 text-sm font-medium text-ring">
                {(writer.nickname ?? writer.email)[0]?.toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {writer.nickname ?? '이름 없음'}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{writer.email}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {PROVIDER_LABELS[writer.oauthProvider ?? ''] ?? '이메일 로그인'}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                가입일: {formatDate(writer.createdAt)}
              </p>
            </div>
          </div>

          {/* 요금제 */}
          <Section title="요금제">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">{plan.displayName}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {plan.tier === 'STARTER' ? '무료' : subscription ? `월 ₩${subscription.monthlyAmount.toLocaleString()}` : 'Pro'}
                </p>
              </div>
              {plan.tier === 'STARTER' && (
                <button
                  type="button"
                  className="rounded-lg bg-ring px-3 py-1.5 text-xs font-medium text-background transition-colors hover:bg-ring/90"
                >
                  Pro로 업그레이드
                </button>
              )}
            </div>
          </Section>

          {/* 클라우드 사용량 */}
          <Section title="클라우드 사용량">
            <div className="space-y-4">
              {/* 저장 공간 게이지 */}
              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">저장 공간</span>
                  <span className={cn(
                    'font-medium',
                    storageFull ? 'text-red-500' : storageWarning ? 'text-amber-500' : 'text-foreground',
                  )}>
                    {formatBytes(usage.storageUsedBytes)} / {formatBytes(plan.storageLimitBytes)}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-500',
                      storageFull ? 'bg-red-500' : storageWarning ? 'bg-amber-500' : 'bg-ring',
                    )}
                    style={{ width: `${Math.min(100, usage.storagePercent)}%` }}
                  />
                </div>
                {storageFull && (
                  <p className="mt-1.5 text-xs text-red-500">
                    클라우드 용량을 초과했습니다. 불필요한 문서를 삭제하거나 Pro로 업그레이드하세요.
                  </p>
                )}
                {storageWarning && (
                  <p className="mt-1.5 text-xs text-amber-500">
                    저장 공간이 부족합니다.
                  </p>
                )}
              </div>
            </div>
          </Section>

          {/* 로컬 저장소 */}
          <LocalStorageSection localBytes={localBytes} />

          {/* 동기화 대기 */}
          <Section title="동기화 상태">
            <SyncPendingGauge
              pendingCount={pendingCount}
              connected={isOnline && psStatus.connected}
            />
          </Section>

          {/* 구독 관리 (Pro 구독 중인 경우만) */}
          {subscription && (
            <Section title="구독 관리">
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">상태</span>
                  <span className="font-medium text-foreground">
                    {subscription.cancelledAt ? '해지 예약됨' : '활성'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">다음 결제일</span>
                  <span className="font-medium text-foreground">
                    {formatDate(subscription.nextBillingAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">월 요금</span>
                  <span className="font-medium text-foreground">
                    ₩{subscription.monthlyAmount.toLocaleString()}
                  </span>
                </div>
              </div>
            </Section>
          )}

          {/* 계정 관리 */}
          <Section title="계정">
            <button
              type="button"
              onClick={() => void logout()}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <LogOut size={13} />
              로그아웃
            </button>
          </Section>
        </div>
      </div>
    </div>
  );
}

function CachedCloudUsageSection({ cached }: { cached: CachedAccountInfo }) {
  const { plan, usage } = cached.data;
  const storageWarning = usage.storagePercent >= 80 && !usage.quotaExceeded;
  const storageFull = usage.quotaExceeded;

  return (
    <Section title="클라우드 사용량">
      <div className="space-y-4">
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">저장 공간</span>
            <span className={cn(
              'font-medium',
              storageFull ? 'text-red-500' : storageWarning ? 'text-amber-500' : 'text-foreground',
            )}>
              {formatBytes(usage.storageUsedBytes)} / {formatBytes(plan.storageLimitBytes)}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                storageFull ? 'bg-red-500' : storageWarning ? 'bg-amber-500' : 'bg-ring',
              )}
              style={{ width: `${Math.min(100, usage.storagePercent)}%` }}
            />
          </div>
          {storageFull && (
            <p className="mt-1.5 text-xs text-red-500">
              클라우드 용량을 초과했습니다. 불필요한 문서를 삭제하거나 Pro로 업그레이드하세요.
            </p>
          )}
          {storageWarning && (
            <p className="mt-1.5 text-xs text-amber-500">
              저장 공간이 부족합니다.
            </p>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground/60">
          마지막 동기화: {formatDateTime(cached.cachedAt)}
        </p>
      </div>
    </Section>
  );
}

function LocalStorageSection({ localBytes }: { localBytes: number }) {
  return (
    <Section title="로컬 저장소">
      <div className="flex items-center gap-3">
        <HardDrive size={16} className="shrink-0 text-muted-foreground" />
        <div className="flex-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">디바이스 사용량</span>
            <span className="font-medium text-foreground">{formatBytes(localBytes)}</span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground/70">
            로컬 SQLite에 저장된 문서·메타데이터 총 용량
          </p>
        </div>
      </div>
    </Section>
  );
}

function SyncPendingGauge({
  pendingCount,
  connected,
}: {
  pendingCount: number;
  connected: boolean;
}) {
  const isCritical = pendingCount >= SYNC_CRITICAL_THRESHOLD;
  const isWarning = pendingCount >= SYNC_WARN_THRESHOLD;

  if (pendingCount === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Cloud size={14} className="text-green-500" />
        <span>모든 변경사항이 동기화되었습니다</span>
      </div>
    );
  }

  const label = isCritical
    ? '동기화가 크게 지연되고 있습니다'
    : isWarning
      ? '동기화 대기 건수가 많습니다'
      : !connected
        ? '오프라인 상태 — 연결 시 자동 동기화'
        : '동기화 대기 중';

  const barColor = isCritical
    ? 'bg-red-500'
    : isWarning
      ? 'bg-amber-500'
      : !connected
        ? 'bg-muted-foreground/40'
        : 'bg-blue-500';

  const textColor = isCritical
    ? 'text-red-500'
    : isWarning
      ? 'text-amber-500'
      : 'text-muted-foreground';

  // 게이지: 0~100 → 100건 미만은 비율 표시, 이상은 100%
  const gaugePercent = Math.min(100, (pendingCount / SYNC_WARN_THRESHOLD) * 100);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <RefreshCw size={13} className={cn(!connected && 'opacity-40')} />
          대기 건수
        </span>
        <span className={cn('font-medium', textColor)}>
          {pendingCount.toLocaleString()}건
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all duration-500', barColor)}
          style={{ width: `${gaugePercent}%` }}
        />
      </div>
      <p className={cn('text-[11px]', textColor)}>{label}</p>
      {isCritical && (
        <p className="text-[11px] text-red-500/80">
          네트워크 연결을 확인하거나, 앱을 재시작해 보세요.
        </p>
      )}
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

function StatusRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
