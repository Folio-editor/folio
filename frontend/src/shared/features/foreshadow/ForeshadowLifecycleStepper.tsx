import { Fragment } from 'react';
import { cn } from '../../lib/cn';

interface ForeshadowLifecycleStepperProps {
  plant: number;
  resolve: number;
  final: number;
  status?: string;
  /** 카드용 미니 사이즈 */
  compact?: boolean;
}

interface StageDef {
  key: 'plant' | 'resolve' | 'final';
  label: string;
  dotClass: string;
  ringClass: string;
}

const STAGES: StageDef[] = [
  { key: 'plant', label: '심기', dotClass: 'bg-foreshadow-plant', ringClass: 'ring-foreshadow-plant/25' },
  { key: 'resolve', label: '강화', dotClass: 'bg-foreshadow-resolve', ringClass: 'ring-foreshadow-resolve/25' },
  { key: 'final', label: '회수', dotClass: 'bg-foreshadow-final', ringClass: 'ring-foreshadow-final/25' },
];

/**
 * 복선 라이프사이클(심기→강화→회수) 진행도 stepper.
 * sort_order/연재 시점에 의존하지 않고 단계 진행만 시각화 — 데이터 모델과 정합.
 */
export function ForeshadowLifecycleStepper({
  plant,
  resolve,
  final,
  status,
  compact = false,
}: ForeshadowLifecycleStepperProps) {
  const counts: Record<StageDef['key'], number> = { plant, resolve, final };
  const muted = status === '폐기';

  return (
    <div className={cn(muted && 'opacity-50')}>
      <div
        className={cn(
          'grid items-center',
          compact
            ? 'grid-cols-[0.625rem_1fr_0.625rem_1fr_0.625rem]'
            : 'grid-cols-[1.125rem_1fr_1.125rem_1fr_1.125rem]',
        )}
      >
        {STAGES.map((stage, idx) => {
          const count = counts[stage.key];
          const filled = count > 0;
          const nextFilled = idx < STAGES.length - 1 && counts[STAGES[idx + 1].key] > 0;
          return (
            <Fragment key={stage.key}>
              <div
                className={cn(
                  'rounded-full transition-colors',
                  compact ? 'h-2.5 w-2.5' : 'h-[1.125rem] w-[1.125rem] ring-4',
                  filled
                    ? cn(stage.dotClass, !compact && stage.ringClass)
                    : compact
                      ? 'border border-border bg-background'
                      : 'border-2 border-border bg-background ring-0',
                )}
              />
              {idx < STAGES.length - 1 && (
                <div
                  className={cn(
                    'h-[2px] transition-colors',
                    compact ? 'mx-1' : 'mx-1.5',
                    filled && nextFilled ? 'bg-foreground/25' : 'bg-border',
                  )}
                />
              )}
            </Fragment>
          );
        })}
      </div>

      {!compact && (
        <div className="mt-2 grid grid-cols-[1.125rem_1fr_1.125rem_1fr_1.125rem]">
          {STAGES.map((stage, idx) => {
            const count = counts[stage.key];
            const filled = count > 0;
            return (
              <Fragment key={stage.key}>
                <div className="flex flex-col items-center whitespace-nowrap">
                  <span
                    className={cn(
                      'text-[11px] font-medium',
                      filled ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {stage.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{count}건</span>
                </div>
                {idx < STAGES.length - 1 && <div />}
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
