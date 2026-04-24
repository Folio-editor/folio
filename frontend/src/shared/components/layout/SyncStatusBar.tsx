import { useEffect, useRef, useState } from 'react';
import { useQuery, useStatus } from '@powersync/react';
import { useIsGuest } from '../../hooks/useWriterId';
import { cn } from '../../lib/cn';

/**
 * 동기화 큐 게이지 바.
 *
 * - `ps_crud` 테이블의 대기 건수를 실시간 조회
 * - 큐가 쌓이면 게이지가 표시되고, 업로드 진행에 따라 채워짐
 * - 완료 시 잠시 green 표시 후 fade out
 * - 오프라인/오류 상태에 따라 색상 변경
 * - 큐가 비어있으면 숨김
 */
export function SyncStatusBar() {
  const isGuest = useIsGuest();
  const status = useStatus();

  const { data: queueRows = [] } = useQuery<{ cnt: number }>(
    'SELECT count(*) as cnt FROM ps_crud',
    [],
  );
  const queueCount = queueRows[0]?.cnt ?? 0;

  // 최대값 추적 — 게이지 비율 계산 기준
  const maxRef = useRef(0);
  const prevCountRef = useRef(0);

  // 완료 후 잠시 표시
  const [showComplete, setShowComplete] = useState(false);
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 큐 증가 시 최대값 갱신
  if (queueCount > maxRef.current) {
    maxRef.current = queueCount;
  }

  // 큐가 0에 도달 → 완료 표시 → fade out
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

  if (isGuest) return null;

  // 큐 비어있고 완료 표시도 끝났으면 숨김
  if (queueCount === 0 && !showComplete) return null;

  const {
    connected,
    dataFlowStatus: { downloadError, uploadError } = {},
  } = status;

  const hasError = Boolean(downloadError || uploadError);

  const progress =
    maxRef.current > 0
      ? ((maxRef.current - queueCount) / maxRef.current) * 100
      : 100;

  const WARN_THRESHOLD = 100;

  const label = hasError
    ? '동기화 오류'
    : !connected && queueCount > 0
      ? `오프라인 · ${queueCount.toLocaleString()}건 대기`
      : queueCount === 0
        ? '동기화 완료'
        : queueCount >= WARN_THRESHOLD
          ? `${queueCount.toLocaleString()}건 대량 동기화 중`
          : `${queueCount.toLocaleString()}건 동기화 중`;

  const barColor = hasError
    ? 'bg-red-500'
    : !connected
      ? 'bg-muted-foreground/40'
      : queueCount === 0
        ? 'bg-green-500'
        : queueCount >= WARN_THRESHOLD
          ? 'bg-amber-500'
          : 'bg-blue-500';

  return (
    <div
      className={cn(
        'px-2 transition-opacity duration-500',
        showComplete && queueCount === 0 ? 'opacity-60' : 'opacity-100',
      )}
    >
      {/* 상태 텍스트 */}
      <div className="mb-0.5 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{label}</span>
      </div>
      {/* 게이지 바 */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all duration-500', barColor)}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
