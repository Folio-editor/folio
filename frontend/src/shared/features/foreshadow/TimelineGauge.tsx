import { cn } from '../../lib/cn';

interface TimelineMarker {
  link_type: string;
  episode_sort: number | null;
  episode_title: string | null;
}

interface TimelineGaugeProps {
  links: TimelineMarker[];
  range: { min: number; max: number };
  compact?: boolean;
}

const MARKER_COLOR: Record<string, string> = {
  plant: 'bg-blue-500',
  resolve: 'bg-amber-500',
  final_resolve: 'bg-emerald-500',
};

const MARKER_LABEL: Record<string, string> = {
  plant: '심기',
  resolve: '강화',
  final_resolve: '회수',
};

/**
 * 복선 타임라인 게이지.
 * 가로 트랙 위에 심기/강화/회수 마커를 위치시킨다.
 * 마커 위치는 episode sort_order 기준으로 비례 배치.
 */
export function TimelineGauge({ links, range, compact = false }: TimelineGaugeProps) {
  const episodeLinks = links.filter((l) => l.episode_sort != null);

  if (episodeLinks.length === 0) {
    return (
      <div className={cn('flex items-center', compact ? 'h-3' : 'h-6')}>
        <div className={cn('w-full rounded-full bg-border', compact ? 'h-0.5' : 'h-1')} />
      </div>
    );
  }

  const span = range.max - range.min;

  const getPosition = (sort: number) => {
    if (span === 0) return 50;
    return ((sort - range.min) / span) * 100;
  };

  return (
    <div className={cn('relative', compact ? 'h-3' : 'h-6')}>
      {/* 트랙 */}
      <div
        className={cn(
          'absolute left-0 right-0 rounded-full bg-border',
          compact ? 'top-[5px] h-0.5' : 'top-[10px] h-1',
        )}
      />

      {/* 마커 */}
      {episodeLinks.map((link, idx) => {
        const pos = getPosition(link.episode_sort!);
        const color = MARKER_COLOR[link.link_type] ?? 'bg-muted-foreground';
        const label = MARKER_LABEL[link.link_type] ?? link.link_type;
        const tooltip = link.episode_title
          ? `${label}: ${link.episode_title}`
          : label;

        return (
          <div
            key={idx}
            className="absolute -translate-x-1/2"
            style={{ left: `${Math.min(Math.max(pos, 2), 98)}%` }}
            title={tooltip}
          >
            <div
              className={cn(
                'rounded-full',
                color,
                compact ? 'h-1.5 w-1.5 mt-[2px]' : 'h-2.5 w-2.5 mt-[5px]',
              )}
            />
          </div>
        );
      })}
    </div>
  );
}

export type { TimelineMarker };
