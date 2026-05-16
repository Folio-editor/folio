import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

const GUIDE_BOOKMARKS = [
  { id: 'sec-01', num: '01', label: '시작' },
  { id: 'sec-02', num: '02', label: '구조' },
  { id: 'sec-03', num: '03', label: '기획' },
  { id: 'sec-04', num: '04', label: '세계관' },
  { id: 'sec-05', num: '05', label: '인물' },
  { id: 'sec-06', num: '06', label: '플롯' },
  { id: 'sec-07', num: '07', label: '원고' },
  { id: 'sec-08', num: '08', label: '복선' },
  { id: 'sec-09', num: '09', label: '도움말' },
  { id: 'sec-10', num: '10', label: '다음' },
];

export function GuideBookmarkNav() {
  const [activeId, setActiveId] = useState(GUIDE_BOOKMARKS[0].id);

  useEffect(() => {
    const updateActive = () => {
      const anchorY = window.scrollY + window.innerHeight * 0.34;
      let current = GUIDE_BOOKMARKS[0].id;

      for (const item of GUIDE_BOOKMARKS) {
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
    <nav className="bookmark-nav guide-bookmark-nav sans" aria-label="가이드 섹션 이동">
      {GUIDE_BOOKMARKS.map((item) => (
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
