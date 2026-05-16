import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

export function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const updateVisibility = () => {
      setVisible(window.scrollY > 520);
    };

    updateVisibility();
    window.addEventListener('scroll', updateVisibility, { passive: true });
    return () => window.removeEventListener('scroll', updateVisibility);
  }, []);

  return (
    <button
      type="button"
      className={`scroll-to-top ${visible ? 'is-visible' : ''}`}
      aria-label="맨 위로 이동"
      title="맨 위로 이동"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
    >
      <ArrowUp size={19} strokeWidth={1.8} aria-hidden="true" />
    </button>
  );
}
