import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

const BOOKMARKS = [
  { id: 'prologue', num: '00', label: '프롤로그' },
  { id: 'features', num: '01', label: '도구' },
  { id: 'extra-features', num: '02', label: '기능' },
  { id: 'flow', num: '03', label: '흐름' },
  { id: 'pricing', num: '04', label: '요금' },
  { id: 'faq', num: '05', label: '문답' },
];

export function LandingBookmarkNav() {
  const [activeId, setActiveId] = useState(BOOKMARKS[0].id);

  useEffect(() => {
    const updateActive = () => {
      const anchorY = window.scrollY + window.innerHeight * 0.38;
      let current = BOOKMARKS[0].id;

      for (const item of BOOKMARKS) {
        const el = document.getElementById(item.id);
        if (!el) continue;
        if (el.offsetTop <= anchorY) current = item.id;
      }

      setActiveId(current);
    };

    updateActive();
    window.addEventListener('scroll', updateActive, { passive: true });
    window.addEventListener('resize', updateActive);
    return () => {
      window.removeEventListener('scroll', updateActive);
      window.removeEventListener('resize', updateActive);
    };
  }, []);

  return (
    <nav className="bookmark-nav sans" aria-label="랜딩 섹션 이동">
      {BOOKMARKS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`bookmark-nav-item${activeId === item.id ? ' active' : ''}`}
          onClick={() =>
            document
              .getElementById(item.id)
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        >
          <span className="bookmark-nav-num">{item.num}</span>
          <span className="bookmark-nav-label">{item.label}</span>
        </button>
      ))}
      <button
        type="button"
        className="bookmark-nav-top"
        aria-label="맨 위로 이동"
        title="맨 위로 이동"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        <ArrowUp size={16} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </nav>
  );
}
