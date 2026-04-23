import { Cloud, CloudOff, LogOut, Sparkles } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useIsGuest } from '../../hooks/useWriterId';
import { useAccountInfo } from '../../hooks/useAccountInfo';
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

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google 계정으로 로그인됨',
};

export function AccountSettings() {
  const isGuest = useIsGuest();

  if (isGuest) return <GuestView />;
  return <AuthenticatedView />;
}

function GuestView() {
  const login = useAuthStore((s) => s.login);
  const isLoggingIn = useAuthStore((s) => s.isLoggingIn);

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
