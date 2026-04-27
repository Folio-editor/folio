import { useEffect, useState } from 'react';

export interface ProgressStage {
  /** 시작 시간(ms) — 0이면 즉시 표시 */
  at: number;
  message: string;
}

/**
 * 시간 기반 단계 메시지를 반환한다.
 * `active`가 true가 되는 순간부터 stage[0] 메시지로 시작해
 * 각 stage의 `at`(ms)가 지나면 다음 메시지로 교체된다.
 */
export function useProgressMessage(active: boolean, stages: ProgressStage[]): string {
  const [message, setMessage] = useState(stages[0]?.message ?? '');

  useEffect(() => {
    if (!active || stages.length === 0) return;

    setMessage(stages[0].message);
    const timers = stages.slice(1).map((stage) =>
      setTimeout(() => setMessage(stage.message), stage.at)
    );

    return () => timers.forEach(clearTimeout);
  }, [active, stages]);

  return message;
}
