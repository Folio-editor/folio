import { useEffect, useState } from 'react';

export function useDelayedEmptyState(isEmpty: boolean, delayMs = 320): boolean {
  const [showEmpty, setShowEmpty] = useState(false);

  useEffect(() => {
    if (!isEmpty) {
      setShowEmpty(false);
      return;
    }

    const timer = window.setTimeout(() => setShowEmpty(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, isEmpty]);

  return showEmpty;
}
