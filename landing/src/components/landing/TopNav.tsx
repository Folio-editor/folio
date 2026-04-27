import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { MouseEvent } from 'react';

export function TopNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleBrandClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (location.pathname === '/') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      navigate('/');
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  };

  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link
          to="/"
          className="nav-brand"
          aria-label="Folio 홈으로"
          onClick={handleBrandClick}
        >
          <img src="/nav-logo.png" alt="Folio" className="nav-logo" />
        </Link>
        <div className="nav-links">
          <a href="/#features" className="nav-link">
            기능
          </a>
          <a href="/#pricing" className="nav-link">
            가격
          </a>
          <a href="/#faq" className="nav-link">
            문답
          </a>
          <a href="/#signup" className="nav-cta sans">
            무료로 시작
          </a>
        </div>
      </div>
    </nav>
  );
}
