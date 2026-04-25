import { useEffect, useRef, useState } from 'react';
import { useQuery, useStatus } from '@powersync/react';
import { useIsGuest } from '../../hooks/useWriterId';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { cn } from '../../lib/cn';

/** 큐 100건을 풀 게이지로 본다 (오프라인/게스트의 누적량 시각화 기준) */
const QUEUE_FULL_AT = 100;
/** 100건 이상은 "대량" 경고 톤 */
const WARN_THRESHOLD = 100;

/**
 * 동기화 / 네트워크 상태 인디케이터.
 *
 * 풋터에 상시 표시되어 사용자가 현재 온/오프라인 여부와 동기화 상태를
 * 한눈에 확인할 수 있도록 한다.
 *
 * 게이지 의미:
 * - 인증 + 온라인 + 큐 진행 중: (처리된 비율) 진행률 표시
 * - 인증 + 온라인 + 큐 0 + 동기화 직후: "동기화됨" 녹색 100% (1.5초)
 * - 인증 + 온라인 + 큐 0 + 평소: 빈 트랙 + "온라인 · 최신 상태"
 * - 오프라인 / 게스트: 큐 누적량을 100건 기준으로 채움 (얼마나 쌓였는지 시각 신호)
 */
export function SyncStatusBar() {
  const isGuest = useIsGuest();
  const isOnline = useNetworkStatus();
  const status = useStatus();

  const { data: queueRows = [] } = useQuery<{ cnt: number }>(
    'SELECT count(*) as cnt FROM ps_crud',
    [],
  );
  const queueCount = queueRows[0]?.cnt ?? 0;

  // 큐 진행률 계산용 — 한 사이클(큐 N → 0) 동안의 최댓값을 기억
  const maxRef = useRef(0);
  const prevCountRef = useRef(0);

  // 동기화 완료(큐 N→0) 직후 잠시 "동기화됨" 녹색 표시
  const [showComplete, setShowComplete] = useState(false);
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (queueCount > maxRef.current) {
    maxRef.current = queueCount;
  }

  useEffect(() => {
    if (queueCount === 0 && prevCountRef.current > 0) {
      setShowComplete(true);
      completeTimerRef.current = setTimeout(() => {
        setShowComplete(false);
        maxRef.current = 0;
      }, 1500);
    }
    prevCountRef.current = queueCount;
    return () => {
      if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
    };
  }, [queueCount]);

  const {
    connected,
    dataFlowStatus: { downloadError, uploadError } = {},
  } = status;

  // 인증 상태에서만 PowerSync connected 의미가 있음.
  // 게스트는 클라우드 연결 자체가 없으므로 isOnline만 본다.
  const effectivelyOffline = !isOnline || (!isGuest && !connected);
  const hasError = !isGuest && Boolean(downloadError || uploadError);

  // ─── 라벨 결정 ────────────────────────────────────────────
  const label = (() => {
    if (hasError) return '동기화 오류';

    if (isGuest) {
      const suffix = ' (게스트)';
      if (effectivelyOffline) {
        return queueCount > 0
          ? `오프라인 · ${queueCount.toLocaleString()}건 대기${suffix}`
          : `오프라인${suffix}`;
      }
      return queueCount > 0
        ? `${queueCount.toLocaleString()}건 대기${suffix}`
        : `온라인${suffix}`;
    }

    if (effectivelyOffline) {
      return queueCount > 0
        ? `오프라인 · ${queueCount.toLocaleString()}건 대기`
        : '오프라인';
    }

    // 인증 + 온라인
    if (queueCount === 0) {
      return showComplete ? '동기화됨' : '온라인 · 최신 상태';
    }
    return queueCount >= WARN_THRESHOLD
      ? `${queueCount.toLocaleString()}건 대량 동기화 중`
      : `${queueCount.toLocaleString()}건 동기화 중`;
  })();

  // ─── 색상 결정 (도트/게이지 공통) ─────────────────────────
  // 우선순위: 오류 > 대량경고 > 오프라인 > 동기화 완료(잠시) > 진행 중 > 평소
  const color = (() => {
    if (hasError) return 'bg-red-500';
    if (queueCount >= WARN_THRESHOLD) return 'bg-amber-500';
    if (effectivelyOffline) return 'bg-muted-foreground/40';
    if (!isGuest && queueCount === 0 && showComplete) return 'bg-green-500';
    if (!isGuest && queueCount > 0) return 'bg-blue-500';
    if (isGuest && queueCount > 0) return 'bg-muted-foreground/60';
    // 평소(온라인 + 큐 0): 차분한 muted — 도트만 옅게 보이고 게이지는 빈 트랙
    return 'bg-muted-foreground/50';
  })();

  // ─── 게이지 채움 비율 ─────────────────────────────────────
  // - 동기화 완료 직후: 100% (녹색이 잠시 가득 차는 시각 효과)
  // - 인증 + 온라인 + 진행 중: 처리된 비율
  // - 오프라인 / 게스트 + 큐 N: 누적량 (100건 기준)
  // - 평소(인증 + 온라인 + 큐 0): 0% (빈 트랙)
  const progress = (() => {
    if (hasError) return 0;
    if (!isGuest && !effectivelyOffline && queueCount === 0) {
      return showComplete ? 100 : 0;
    }
    if (!isGuest && !effectivelyOffline && maxRef.current > 0) {
      // 동기화 진행률
      return ((maxRef.current - queueCount) / maxRef.current) * 100;
    }
    if (queueCount === 0) return 0;
    // 오프라인 또는 게스트: 누적량
    return Math.min(100, (queueCount / QUEUE_FULL_AT) * 100);
  })();

  return (
    <div
      className={cn(
        'px-2 transition-opacity duration-500',
        showComplete && queueCount === 0 ? 'opacity-80' : 'opacity-100',
      )}
    >
      {/* 상태 텍스트 */}
      <div className="mb-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', color)} />
        <span className="truncate">{label}</span>
      </div>
      {/* 게이지 바 */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all duration-500', color)}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
