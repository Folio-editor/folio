import { useEffect, useRef, useState } from 'react';
import { EXTRA_TOOLS, type ExtraTool } from '../../data/landing-content';

const INTERVAL_MS = 4500;
const CARDS_PER_PAGE = 3;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function FeaturesAutoCarousel() {
  const pages = chunk<ExtraTool>(EXTRA_TOOLS, CARDS_PER_PAGE);
  const totalPages = pages.length;

  const viewportRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const [page, setPage] = useState(0);

  useEffect(() => {
    const reduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    if (reduced) return;

    let timer: number | null = null;
    const stop = () => {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    };
    const start = () => {
      stop();
      timer = window.setInterval(() => {
        if (!pausedRef.current) {
          setPage((p) => (p + 1) % totalPages);
        }
      }, INTERVAL_MS);
    };

    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    document.addEventListener('visibilitychange', onVisibility);

    const el = viewportRef.current;
    let io: IntersectionObserver | null = null;
    if (el && 'IntersectionObserver' in window) {
      io = new IntersectionObserver(
        (entries) =>
          entries.forEach((e) => (e.isIntersecting ? start() : stop())),
        { threshold: 0.3 },
      );
      io.observe(el);
    } else {
      start();
    }

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      io?.disconnect();
    };
  }, [totalPages]);

  const goTo = (p: number) => {
    const next = ((p % totalPages) + totalPages) % totalPages;
    setPage(next);
  };

  return (
    <div className="carousel-wrap" id="extra-features">
      <div className="carousel-head">
        <div>
          <div className="carousel-label sans">그 외 기능</div>
          <h3 className="carousel-heading">작가를 돕는 도구 몇 가지 더.</h3>
        </div>
        <div className="carousel-dots" role="tablist">
          {pages.map((_, i) => (
            <button
              type="button"
              key={i}
              className={`carousel-dot${i === page ? ' active' : ''}`}
              aria-label={`${i + 1}페이지`}
              aria-selected={i === page}
              role="tab"
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      </div>

      <div
        className="carousel-viewport"
        ref={viewportRef}
        onMouseEnter={() => {
          pausedRef.current = true;
        }}
        onMouseLeave={() => {
          pausedRef.current = false;
        }}
      >
        <div
          className="carousel-track"
          style={{ transform: `translateX(-${page * 100}%)` }}
        >
          {pages.map((pageItems, pIdx) => (
            <div className="carousel-page" key={pIdx}>
              {pageItems.map((item) => (
                <article className="carousel-card" key={item.num}>
                  <div className="carousel-card-num sans">{item.num}</div>
                  <h4 className="carousel-card-title">{item.title}</h4>
                  <p className="carousel-card-desc">{item.desc}</p>
                  <div className="carousel-card-meta">{item.meta}</div>
                </article>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
