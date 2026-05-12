/**
 * 일일 글자수 목표 위젯 — 에디터 우측하단 floating 미니 카드.
 *
 * UX:
 *   - 둥근 직사각형 카드 (2단 layout)
 *     · 1단: 아이콘 + "일일 목표" 라벨 + 퍼센트
 *     · 2단: 현재 글자수 / 목표 글자수 (큰 폰트)
 *     · 하단: 진행바 (분리된 element)
 *   - 위젯 전체 드래그 → 본문 영역 안 어디로든 이동
 *   - 위치 localStorage 영속 (다음 진입 시 복원)
 *   - 본문 스크롤과 무관 (relative wrapper 안 absolute 배치)
 *   - 현재 표시 = ★현재 원고 전체 글자수 (charCount)★ — 세션 시작 시점부터의 delta 가 아닌 절대값.
 *     세션 추적이 직관적이지 않다는 사용자 피드백 반영 (0 만 보임 문제).
 *   - 목표 달성 시 success 색상 + ✓
 *
 * dailyGoalEnabled=false 면 null 반환.
 */

import { useEffect, useRef, useState } from 'react';
import { Check, Target, X } from 'lucide-react';
import { useEditorSettings } from '../../stores/editorSettingsStore';
import { cn } from '../../lib/cn';

const LS_KEY = 'folio.dailyGoalWidget.position';

interface Position {
  right: number;
  bottom: number;
}

const DEFAULT_POSITION: Position = { right: 24, bottom: 24 };

function loadPosition(): Position {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_POSITION;
    const parsed = JSON.parse(raw) as Partial<Position>;
    if (typeof parsed.right !== 'number' || typeof parsed.bottom !== 'number') {
      return DEFAULT_POSITION;
    }
    return { right: parsed.right, bottom: parsed.bottom };
  } catch {
    return DEFAULT_POSITION;
  }
}

function savePosition(pos: Position): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(pos));
  } catch { /* localStorage 비활성 — silent */ }
}

interface DailyGoalWidgetProps {
  /** (legacy 파라미터 — 호환성 유지, 현재는 미사용. charCount 가 현재 표시값) */
  sessionStartChars?: number;
  /** 현재 원고 글자수 */
  charCount: number;
}

export default function DailyGoalWidget({ charCount }: DailyGoalWidgetProps) {
  const { dailyGoalEnabled, dailyGoalChars, set } = useEditorSettings();
  const [position, setPosition] = useState<Position>(loadPosition);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startRight: number;
    startBottom: number;
  } | null>(null);

  useEffect(() => {
    if (!dragging) return;

    function onMove(e: PointerEvent) {
      const s = dragRef.current;
      if (!s) return;
      e.preventDefault();
      const dx = e.clientX - s.startX;
      const dy = e.clientY - s.startY;
      setPosition({
        right: Math.max(0, s.startRight - dx),
        bottom: Math.max(0, s.startBottom - dy),
      });
    }
    function onUp() {
      setDragging(false);
      dragRef.current = null;
    }

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragging]);

  useEffect(() => {
    if (!dragging) savePosition(position);
  }, [dragging, position]);

  if (!dailyGoalEnabled) return null;

  // 현재 원고의 절대 글자수 기준 (세션 delta 가 아님)
  const current = Math.max(0, charCount);
  const goal = Math.max(0, dailyGoalChars);
  const ratio = goal > 0 ? Math.min(1, current / goal) : 0;
  const percent = Math.round(ratio * 100);
  const achieved = goal > 0 && current >= goal;

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startRight: position.right,
      startBottom: position.bottom,
    };
    setDragging(true);
  }

  return (
    <div
      role="status"
      aria-label={`목표 ${current} / ${goal}자 (${percent}%)`}
      onPointerDown={onPointerDown}
      className={cn(
        'absolute z-20 select-none touch-none',
        // 둥근 직사각형 카드 — 충분한 폭/높이
        'flex flex-col gap-1.5 rounded-xl border shadow-lg backdrop-blur',
        'bg-popover/95 px-3.5 py-2.5',
        'w-56',
        achieved ? 'border-success/50' : 'border-border',
        dragging ? 'cursor-grabbing opacity-95 shadow-xl' : 'cursor-grab',
        'transition-shadow hover:shadow-xl',
      )}
      style={{
        right: position.right,
        bottom: position.bottom,
      }}
    >
      {/* 1단: 아이콘 + 라벨 + 퍼센트 + 닫기 버튼 */}
      <div className="flex items-center gap-1.5">
        {achieved ? (
          <Check size={14} className="shrink-0 text-success" />
        ) : (
          <Target size={13} className="shrink-0 text-muted-foreground" />
        )}
        <span
          className={cn(
            'flex-1 text-[11px] font-semibold uppercase tracking-wider',
            achieved ? 'text-success' : 'text-muted-foreground',
          )}
        >
          목표
        </span>
        <span
          className={cn(
            'font-mono text-[11px] font-medium tabular-nums',
            achieved ? 'text-success' : 'text-muted-foreground',
          )}
        >
          {percent}%
        </span>
        {/* 닫기 — 위젯 즉시 OFF (설정 → 다시 ON 으로만 복원) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            set('dailyGoalEnabled', false);
          }}
          onPointerDown={(e) => {
            // 드래그 트리거 방지 — 버튼 영역에서 드래그 시작 안 함
            e.stopPropagation();
          }}
          title="목표 위젯 닫기"
          aria-label="목표 위젯 닫기"
          className="-mr-0.5 ml-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X size={11} />
        </button>
      </div>

      {/* 2단: 큰 숫자 — 현재 / 목표 */}
      <div className="flex items-baseline gap-1.5 font-mono tabular-nums">
        <span
          className={cn(
            'text-base font-bold leading-none',
            achieved ? 'text-success' : 'text-foreground',
          )}
        >
          {current.toLocaleString()}
        </span>
        <span className="text-xs text-muted-foreground">/</span>
        <span className="text-xs text-muted-foreground">
          {goal.toLocaleString()}자
        </span>
      </div>

      {/* 3단: 진행바 */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-300',
            achieved ? 'bg-success' : 'bg-primary',
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
