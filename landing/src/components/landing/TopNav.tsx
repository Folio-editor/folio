import { buildLoginUrl } from '../../lib/loginUrl';

export function TopNav() {
  // 백엔드 OAuth start로 직접 이동 — full-page navigation
  const loginUrl = buildLoginUrl('/');
  return (
    <nav className="nav">
      <div className="nav-inner">
        <a href="#" className="nav-brand" aria-label="Folio">
          <img src="/nav-logo.png" alt="Folio" className="nav-logo" />
        </a>
        <div className="nav-links">
          <a href="#features" className="nav-link">
            기능
          </a>
          <a href="#pricing" className="nav-link">
            가격
          </a>
          <a href="#faq" className="nav-link">
            문답
          </a>
          <a href={loginUrl} className="nav-cta sans">
            로그인
          </a>
        </div>
      </div>
    </nav>
  );
}
